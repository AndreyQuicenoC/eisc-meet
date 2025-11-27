import { useState, useEffect, useRef, useCallback } from "react";
import Peer, { MediaConnection } from "peerjs";
import { signalingSocket } from "../../lib/webrtc.config";
import { SIGNALING_URL } from "../../lib/env.config";
import "./VideoCall.scss";

/**
 * VideoCall Component - Refactorizado
 * 
 * Mejoras implementadas:
 * - Una sola conexión al signaling server (en startCall)
 * - Manejo robusto de remotePeerId con pending queue
 * - Limpieza correcta de streams remotos (removeTrack en lugar de stop)
 * - Reproducción mejorada de video remoto con retry logic
 * - endCall() solo limpia recursos locales, no estado del servidor
 * - Código modular con funciones separadas
 * - Sin memory leaks ni listeners duplicados
 * - Logs claros para debugging
 */

const VideoCall: React.FC = () => {
  // ============ STATE ============
  const [isConnected, setIsConnected] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [remotePeerId, setRemotePeerId] = useState<string | null>(null);
  const [roomFull, setRoomFull] = useState(false);
  const [usersOnline, setUsersOnline] = useState(0);

  // ============ REFS ============
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  
  // Control flags
  const myPeerIdRef = useRef<string | null>(null);
  const hasInitiatedCallRef = useRef(false);
  const isPeerReadyRef = useRef(false);
  const pendingRemotePeerIdRef = useRef<string | null>(null);

  // ============ HELPERS ============
  const logStreamInfo = useCallback((stream: MediaStream, label: string) => {
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    console.log(`%c📊 Stream ${label}`, "color: cyan; font-weight: bold");
    console.log(`  Stream ID: ${stream.id}`);
    console.log(`  Active: ${stream.active}`);
    console.log(`  Video tracks: ${videoTracks.length}`);
    videoTracks.forEach((track, i) => {
      const settings = track.getSettings();
      console.log(`    ${i + 1}. ${track.label || "Video"}`);
      console.log(`       Enabled: ${track.enabled}, State: ${track.readyState}`);
      console.log(`       Resolution: ${settings.width}x${settings.height} @ ${settings.frameRate}fps`);
    });
    console.log(`  Audio tracks: ${audioTracks.length}`);
    audioTracks.forEach((track, i) => {
      const settings = track.getSettings();
      console.log(`    ${i + 1}. ${track.label || "Audio"}`);
      console.log(`       Enabled: ${track.enabled}, State: ${track.readyState}`);
      console.log(`       SampleRate: ${settings.sampleRate}, Channels: ${settings.channelCount}`);
    });
  }, []);

  // ============ ATTACH REMOTE STREAM ============
  const attachRemoteStream = useCallback(async (stream: MediaStream, fromPeerId: string) => {
    console.log("%c🎬 ATTACHING REMOTE STREAM", "color: green; font-size: 14px; font-weight: bold");
    console.log(`  From Peer: ${fromPeerId}`);
    
    logStreamInfo(stream, `remoto de ${fromPeerId.substring(0, 8)}`);

    // Setup track event listeners
    stream.getTracks().forEach((track) => {
      track.onended = () => {
        console.log(`%c📴 REMOTE ${track.kind.toUpperCase()} ENDED`, "color: red; font-weight: bold");
      };
      track.onmute = () => {
        console.log(`%c🔇 REMOTE ${track.kind.toUpperCase()} MUTED`, "color: orange; font-weight: bold");
      };
      track.onunmute = () => {
        console.log(`%c🔊 REMOTE ${track.kind.toUpperCase()} UNMUTED`, "color: green; font-weight: bold");
      };
    });

    if (!remoteVideoRef.current) {
      console.error("%c❌ remoteVideoRef is null!", "color: red; font-weight: bold");
      return;
    }

    // ✅ CORRECCIÓN: Usar removeTrack en lugar de stop() para tracks remotos
    const oldStream = remoteVideoRef.current.srcObject as MediaStream;
    if (oldStream) {
      console.log("  🧹 Removing old stream tracks...");
      oldStream.getTracks().forEach((track) => {
        oldStream.removeTrack(track);
        console.log(`    Removed ${track.kind} track (NOT stopped - remote track)`);
      });
    }

    // Set new stream
    console.log("  🔗 Setting new remote stream...");
    remoteVideoRef.current.srcObject = stream;
    remoteVideoRef.current.muted = false;
    remoteVideoRef.current.volume = 1.0;

    // Wait for metadata with timeout
    await Promise.race([
      new Promise<boolean>((resolve) => {
        remoteVideoRef.current!.onloadedmetadata = () => {
          console.log("  ✅ Metadata loaded");
          console.log(`    Dimensions: ${remoteVideoRef.current!.videoWidth}x${remoteVideoRef.current!.videoHeight}`);
          resolve(true);
        };
      }),
      new Promise<boolean>((resolve) => setTimeout(() => {
        console.warn("  ⏰ Metadata timeout, proceeding anyway");
        resolve(false);
      }, 2000))
    ]);

    // ✅ CORRECCIÓN: Retry logic mejorado para reproducción
    const playVideo = async (retries = 3): Promise<boolean> => {
      for (let i = 0; i < retries; i++) {
        try {
          await remoteVideoRef.current!.play();
          console.log("%c✅ REMOTE VIDEO PLAYING", "color: green; font-weight: bold");
          return true;
        } catch (err: unknown) {
          const error = err as Error;
          console.warn(`  ⚠️ Play attempt ${i + 1}/${retries} failed:`, error.message);
          if (i < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      }
      return false;
    };

    const played = await playVideo();
    
    if (!played) {
      console.log("  👆 Waiting for user interaction to play video...");
      const playOnClick = () => {
        remoteVideoRef.current?.play()
          .then(() => console.log("✅ Video playing after user interaction"))
          .catch(err => console.error("❌ Still failed:", err));
        document.removeEventListener("click", playOnClick);
      };
      document.addEventListener("click", playOnClick, { once: true });
    }
  }, [logStreamInfo]);

  // ============ CALL HANDLERS ============
  const setupCallHandlers = useCallback((call: MediaConnection) => {
    console.log("%c🎯 SETTING UP CALL HANDLERS", "color: cyan; font-weight: bold");
    console.log(`  For Peer: ${call.peer}`);

    call.on("stream", (remoteStream: MediaStream) => {
      console.log("%c📥 REMOTE STREAM RECEIVED", "color: green; font-weight: bold");
      attachRemoteStream(remoteStream, call.peer);
    });

    call.on("close", () => {
      console.log("%c📞 CALL CLOSED", "color: red; font-weight: bold");
      console.log(`  From Peer: ${call.peer}`);
      
      if (remoteVideoRef.current) {
        const stream = remoteVideoRef.current.srcObject as MediaStream;
        if (stream) {
          stream.getTracks().forEach(track => stream.removeTrack(track));
        }
        remoteVideoRef.current.srcObject = null;
      }
      
      if (callRef.current === call) {
        callRef.current = null;
        hasInitiatedCallRef.current = false;
      }
    });

    call.on("error", (err: Error) => {
      console.error("%c❌ CALL ERROR", "color: red; font-weight: bold");
      console.error(`  Peer: ${call.peer}`);
      console.error(`  Error:`, err);
      hasInitiatedCallRef.current = false;
    });
  }, [attachRemoteStream]);

  // ============ INITIATE OUTGOING CALL ============
  const initiateCall = useCallback((targetPeerId: string) => {
    console.log("%c📞 INITIATING OUTGOING CALL", "color: blue; font-weight: bold");
    console.log(`  Target Peer: ${targetPeerId}`);
    console.log(`  My Peer: ${myPeerIdRef.current}`);

    // ✅ CORRECCIÓN: Validaciones robustas antes de iniciar llamada
    if (!peerRef.current || !isPeerReadyRef.current) {
      console.warn("  ⚠️ Peer not ready, storing for later");
      pendingRemotePeerIdRef.current = targetPeerId;
      return;
    }

    if (!localStreamRef.current) {
      console.error("  ❌ No local stream available");
      return;
    }

    if (hasInitiatedCallRef.current) {
      console.log("  ℹ️ Call already initiated, skipping");
      return;
    }

    if (targetPeerId === myPeerIdRef.current) {
      console.warn("  ⚠️ Cannot call myself, ignoring");
      return;
    }

    // ✅ CORRECCIÓN: Set flag BEFORE making call to prevent race conditions
    hasInitiatedCallRef.current = true;

    console.log("  📤 Calling peer with local stream...");
    logStreamInfo(localStreamRef.current, "local para llamada saliente");

    try {
      const call = peerRef.current.call(targetPeerId, localStreamRef.current);
      
      if (!call) {
        console.error("  ❌ Failed to create call");
        hasInitiatedCallRef.current = false;
        return;
      }

      callRef.current = call;
      setupCallHandlers(call);
      console.log("  ✅ Outgoing call initiated");
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("  ❌ Error creating call:", err.message);
      hasInitiatedCallRef.current = false;
    }
  }, [logStreamInfo, setupCallHandlers]);

  // ============ HANDLE INCOMING CALL ============
  const handleIncomingCall = useCallback((call: MediaConnection) => {
    console.log("%c📞 INCOMING CALL", "color: orange; font-weight: bold");
    console.log(`  From Peer: ${call.peer}`);
    console.log(`  My Peer: ${myPeerIdRef.current}`);

    if (!localStreamRef.current) {
      console.error("  ❌ No local stream to answer with");
      return;
    }

    console.log("  📤 Answering call with local stream...");
    logStreamInfo(localStreamRef.current, "local para responder");

    call.answer(localStreamRef.current);

    // Only set callRef if we don't have one
    if (!callRef.current) {
      callRef.current = call;
      hasInitiatedCallRef.current = true;
      console.log("  ✅ Call answered and stored");
    } else {
      console.log("  ℹ️ Already have a call, not overwriting");
    }

    setupCallHandlers(call);
  }, [logStreamInfo, setupCallHandlers]);

  // ============ SETUP PEER CONNECTION ============
  const setupPeer = useCallback(() => {
    console.log("%c🔧 SETTING UP PEER", "color: purple; font-weight: bold");

    const url = new URL(SIGNALING_URL);
    const host = url.hostname;
    const port = parseInt(url.port) || (url.protocol === "https:" ? 443 : 80);
    const secure = url.protocol === "https:";

    console.log(`  Host: ${host}:${port} (secure: ${secure})`);

    const peer = new Peer({
      host,
      port,
      path: "/peerjs",
      secure,
      debug: 2,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun3.l.google.com:19302" },
          { urls: "stun:stun4.l.google.com:19302" },
        ],
        iceTransportPolicy: "all",
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
      },
    });

    peer.on("open", (id) => {
      console.log("%c✅ PEER OPENED", "color: green; font-weight: bold");
      console.log(`  🆔 My Peer ID: ${id}`);
      
      myPeerIdRef.current = id;
      isPeerReadyRef.current = true;

      // Register with signaling server
      console.log("  📡 Registering Peer ID with signaling server...");
      signalingSocket.emit("registerPeerId", id);

      // ✅ CORRECCIÓN: Check if we have a pending remote peer to call
      if (pendingRemotePeerIdRef.current) {
        console.log(`  🔄 Found pending remote peer: ${pendingRemotePeerIdRef.current}`);
        const pending = pendingRemotePeerIdRef.current;
        pendingRemotePeerIdRef.current = null;
        
        // Delay to ensure remote peer is also ready
        setTimeout(() => {
          console.log("  📞 Initiating pending call...");
          initiateCall(pending);
        }, 500);
      }
    });

    peer.on("call", handleIncomingCall);

    peer.on("error", (err) => {
      console.error("%c❌ PEER ERROR", "color: red; font-weight: bold");
      console.error(`  Type: ${err.type}`);
      console.error(`  Message: ${err.message}`);

      if (err.type === "peer-unavailable") {
        console.log("  ⚠️ Peer unavailable, will retry when available");
      } else {
        alert(`Error en conexión Peer: ${err.message}`);
      }
    });

    peer.on("disconnected", () => {
      console.warn("%c⚠️ PEER DISCONNECTED", "color: orange; font-weight: bold");
      isPeerReadyRef.current = false;
    });

    peer.on("close", () => {
      console.log("%c🔒 PEER CLOSED", "color: red; font-weight: bold");
      isPeerReadyRef.current = false;
    });

    return peer;
  }, [handleIncomingCall, initiateCall]);

  // ============ SETUP SOCKET LISTENERS ============
  useEffect(() => {
    console.log("%c🔌 SETTING UP SOCKET LISTENERS", "color: blue; font-weight: bold");

    const handleConnect = () => {
      setIsConnected(true);
      console.log("%c✅ SIGNALING CONNECTED", "color: green; font-weight: bold");
      console.log(`  Socket ID: ${signalingSocket.id}`);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      console.log("%c❌ SIGNALING DISCONNECTED", "color: red; font-weight: bold");
    };

    const handleRoomFull = (data: { message: string }) => {
      console.log("%c⚠️ ROOM FULL", "color: orange; font-weight: bold");
      setRoomFull(true);
      alert(data.message);
      signalingSocket.disconnect();
    };

    const handleUserCount = (count: number) => {
      console.log(`%c👥 USER COUNT: ${count}`, "color: blue; font-weight: bold");
      setUsersOnline(count);
    };

    const handleRemotePeerId = (peerId: string) => {
      console.log("%c🆔 REMOTE PEER ID RECEIVED", "color: purple; font-weight: bold");
      console.log(`  Remote: ${peerId}`);
      console.log(`  Mine: ${myPeerIdRef.current}`);

      // Ignore our own peer ID
      if (peerId === myPeerIdRef.current) {
        console.log("  ⚠️ This is my own ID, ignoring");
        return;
      }

      setRemotePeerId(peerId);

      // ✅ CORRECCIÓN: Try to initiate call immediately if peer is ready
      if (isPeerReadyRef.current && !hasInitiatedCallRef.current) {
        console.log("  📞 Peer ready, initiating call...");
        setTimeout(() => initiateCall(peerId), 500);
      } else {
        console.log("  ⏳ Peer not ready or call already initiated, storing for later");
        pendingRemotePeerIdRef.current = peerId;
      }
    };

    const handleUserDisconnected = () => {
      console.log("%c👋 REMOTE USER DISCONNECTED", "color: orange; font-weight: bold");
      
      if (remoteVideoRef.current) {
        const stream = remoteVideoRef.current.srcObject as MediaStream;
        if (stream) {
          stream.getTracks().forEach(track => stream.removeTrack(track));
        }
        remoteVideoRef.current.srcObject = null;
      }
      
      if (callRef.current) {
        callRef.current.close();
        callRef.current = null;
      }
      
      setRemotePeerId(null);
      hasInitiatedCallRef.current = false;
      pendingRemotePeerIdRef.current = null;
    };

    const handleMediaToggle = (data: { type: "audio" | "video"; enabled: boolean; peerId: string }) => {
      console.log("%c🔄 REMOTE MEDIA TOGGLE", "color: purple; font-weight: bold");
      console.log(`  Type: ${data.type}, Enabled: ${data.enabled}`);
    };

    // ✅ CORRECCIÓN: Solo configurar listeners, NO conectar aquí
    signalingSocket.on("connect", handleConnect);
    signalingSocket.on("disconnect", handleDisconnect);
    signalingSocket.on("roomFull", handleRoomFull);
    signalingSocket.on("userCount", handleUserCount);
    signalingSocket.on("remotePeerId", handleRemotePeerId);
    signalingSocket.on("userDisconnected", handleUserDisconnected);
    signalingSocket.on("mediaToggle", handleMediaToggle);

    // Cleanup on unmount
    return () => {
      console.log("%c🧹 CLEANING UP SOCKET LISTENERS", "color: gray; font-weight: bold");
      
      signalingSocket.off("connect", handleConnect);
      signalingSocket.off("disconnect", handleDisconnect);
      signalingSocket.off("roomFull", handleRoomFull);
      signalingSocket.off("userCount", handleUserCount);
      signalingSocket.off("remotePeerId", handleRemotePeerId);
      signalingSocket.off("userDisconnected", handleUserDisconnected);
      signalingSocket.off("mediaToggle", handleMediaToggle);
    };
  }, [initiateCall]);

  // ============ GET MEDIA STREAM ============
  const getMediaStream = useCallback(async (): Promise<MediaStream> => {
    console.log("%c🎥 GETTING MEDIA STREAM", "color: blue; font-weight: bold");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      console.log("%c✅ VIDEO + AUDIO OBTAINED", "color: green; font-weight: bold");
      logStreamInfo(stream, "local obtenido");
      return stream;
    } catch (videoError: unknown) {
      const error = videoError as Error;
      console.warn("%c⚠️ VIDEO FAILED, TRYING AUDIO ONLY", "color: orange; font-weight: bold");
      console.error(`  Error: ${error.message}`);

      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });

        console.log("%c✅ AUDIO-ONLY OBTAINED", "color: yellow; font-weight: bold");
        alert("No se pudo acceder a la cámara. La llamada continuará solo con audio.");
        logStreamInfo(audioStream, "local (solo audio)");
        return audioStream;
      } catch (audioError: unknown) {
        const error = audioError as Error;
        console.error("%c❌ ALL MEDIA ACCESS FAILED", "color: red; font-weight: bold");
        console.error(`  Error: ${error.message}`);
        throw new Error("No se pudo acceder a la cámara ni al micrófono. Verifica los permisos.");
      }
    }
  }, [logStreamInfo]);

  // ============ START CALL ============
  const startCall = useCallback(async () => {
    console.log("%c🚀 STARTING CALL", "color: green; font-size: 16px; font-weight: bold");

    if (roomFull) {
      alert("La sala está llena. Solo se permiten 2 usuarios.");
      return;
    }

    try {
      // ✅ CORRECCIÓN: Step 1 - Connect to signaling server ONLY if not connected
      if (!signalingSocket.connected) {
        console.log("%c📡 STEP 1: Connecting to signaling", "color: blue; font-weight: bold");
        
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Timeout conectando")), 10000);
          
          const onConnect = () => {
            clearTimeout(timeout);
            signalingSocket.off("connect", onConnect);
            signalingSocket.off("roomFull", onRoomFull);
            signalingSocket.off("connect_error", onError);
            resolve();
          };
          
          const onRoomFull = () => {
            clearTimeout(timeout);
            reject(new Error("Sala llena"));
          };
          
          const onError = (err: Error) => {
            clearTimeout(timeout);
            reject(err);
          };

          signalingSocket.once("connect", onConnect);
          signalingSocket.once("roomFull", onRoomFull);
          signalingSocket.once("connect_error", onError);
          
          signalingSocket.connect();
        });

        console.log("  ✅ Connected to signaling");
      } else {
        console.log("  ℹ️ Already connected to signaling");
      }

      // Step 2: Get media stream
      console.log("%c📹 STEP 2: Getting media stream", "color: blue; font-weight: bold");
      const stream = await getMediaStream();
      localStreamRef.current = stream;
      console.log(`  ✅ Got ${stream.getVideoTracks().length}V + ${stream.getAudioTracks().length}A`);

      // Step 3: Display local video
      console.log("%c🎥 STEP 3: Displaying local video", "color: blue; font-weight: bold");
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await new Promise(resolve => setTimeout(resolve, 100));
        
        try {
          await localVideoRef.current.play();
          console.log("  ✅ Local video playing");
        } catch (err: unknown) {
          const error = err as Error;
          console.warn("  ⚠️ Local video autoplay failed:", error.message);
        }
      }

      // Step 4: Setup PeerJS
      console.log("%c🔗 STEP 4: Setting up PeerJS", "color: blue; font-weight: bold");
      const peer = setupPeer();
      peerRef.current = peer;

      setIsCallActive(true);
      console.log("%c✅ CALL SETUP COMPLETE", "color: green; font-size: 16px; font-weight: bold");
    } catch (error: unknown) {
      const err = error as Error;
      console.error("%c❌ CALL SETUP FAILED", "color: red; font-size: 16px; font-weight: bold");
      console.error(`  Error: ${err.message}`);
      alert(`Error al iniciar la llamada: ${(error as Error).message}`);

      // Cleanup on error
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      
      if (signalingSocket.connected) {
        signalingSocket.disconnect();
      }
    }
  }, [roomFull, getMediaStream, setupPeer]);

  // ============ END CALL ============
  const endCall = useCallback(() => {
    console.log("%c🛑 ENDING CALL", "color: red; font-weight: bold");

    // Close call
    if (callRef.current) {
      console.log("  Closing call...");
      callRef.current.close();
      callRef.current = null;
    }

    // Destroy peer
    if (peerRef.current) {
      console.log("  Destroying peer...");
      peerRef.current.destroy();
      peerRef.current = null;
    }

    // Stop local media
    if (localStreamRef.current) {
      console.log("  Stopping local stream...");
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    // Clean video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    
    if (remoteVideoRef.current) {
      const stream = remoteVideoRef.current.srcObject as MediaStream;
      if (stream) {
        stream.getTracks().forEach(track => stream.removeTrack(track));
      }
      remoteVideoRef.current.srcObject = null;
    }

    // Reset flags
    hasInitiatedCallRef.current = false;
    isPeerReadyRef.current = false;
    myPeerIdRef.current = null;
    pendingRemotePeerIdRef.current = null;

    // Disconnect from signaling
    if (signalingSocket.connected) {
      console.log("  Disconnecting from signaling...");
      signalingSocket.disconnect();
    }

    // ✅ CORRECCIÓN: Reset UI state pero NO estado del servidor (usersOnline/roomFull)
    setIsCallActive(false);
    setIsMuted(false);
    setIsVideoEnabled(true);
    setRemotePeerId(null);
    // NO resetear: usersOnline, roomFull (esos vienen del servidor)

    console.log("  ✅ Call ended and cleaned up");
  }, []);

  // ============ TOGGLE MUTE ============
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;

    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
      
      console.log(`%c🔊 AUDIO ${audioTrack.enabled ? "ENABLED" : "MUTED"}`, "color: cyan; font-weight: bold");

      if (signalingSocket.connected && myPeerIdRef.current) {
        signalingSocket.emit("mediaToggle", {
          type: "audio",
          enabled: audioTrack.enabled,
          peerId: myPeerIdRef.current,
        });
      }
    }
  }, []);

  // ============ TOGGLE VIDEO ============
  const toggleVideo = useCallback(() => {
    if (!localStreamRef.current) return;

    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoEnabled(videoTrack.enabled);
      
      console.log(`%c📹 VIDEO ${videoTrack.enabled ? "ENABLED" : "DISABLED"}`, "color: magenta; font-weight: bold");

      if (signalingSocket.connected && myPeerIdRef.current) {
        signalingSocket.emit("mediaToggle", {
          type: "video",
          enabled: videoTrack.enabled,
          peerId: myPeerIdRef.current,
        });
      }
    }
  }, []);

  // ============ CLEANUP ON UNMOUNT ============
  useEffect(() => {
    return () => {
      console.log("%c🧹 COMPONENT UNMOUNTING - CLEANUP", "color: gray; font-weight: bold");
      
      if (callRef.current) {
        callRef.current.close();
      }
      
      if (peerRef.current) {
        peerRef.current.destroy();
      }
      
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      if (signalingSocket.connected) {
        signalingSocket.disconnect();
      }
    };
  }, []);

  // ============ RENDER ============
  return (
    <div className="video-call-container">
      {/* Header */}
      <div className="video-header">
        <h3>Video Llamada</h3>
        <div className="status">
          {isConnected ? (
            <span className="status-indicator online">
              ● Conectado ({usersOnline}/2)
            </span>
          ) : (
            <span className="status-indicator offline">● Desconectado</span>
          )}
        </div>
      </div>

      {roomFull && (
        <div className="room-full-warning">
          <svg className="warning-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          La sala está llena. Solo se permiten 2 usuarios.
        </div>
      )}

      {!isCallActive && !roomFull && (
        <div className="video-info">
          <svg className="info-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <strong>Nota:</strong> Al iniciar la llamada, tu navegador pedirá permiso para acceder a la cámara y micrófono.
        </div>
      )}

      {/* Video panels */}
      <div className="video-panels">
        <div className="video-panel local">
          <video ref={localVideoRef} autoPlay muted playsInline
            className={!isVideoEnabled ? "video-disabled" : ""} />
          <div className="video-label">
            {isVideoEnabled ? "Tú" : "Cámara desactivada"}
          </div>
        </div>

        <div className="video-panel remote">
          <video ref={remoteVideoRef} autoPlay playsInline controls={false} />
          <div className="video-label">
            {remotePeerId ? "Usuario remoto" : "Esperando conexión..."}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="video-controls">
        {!isCallActive ? (
          <button onClick={startCall} disabled={roomFull} className="btn-start-call">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Iniciar Llamada
          </button>
        ) : (
          <>
            <button onClick={toggleMute} className={`btn-control ${isMuted ? "muted" : ""}`}
              title={isMuted ? "Activar micrófono" : "Silenciar micrófono"}>
              {isMuted ? (
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              )}
            </button>

            <button onClick={toggleVideo} className={`btn-control ${!isVideoEnabled ? "disabled" : ""}`}
              title={isVideoEnabled ? "Desactivar cámara" : "Activar cámara"}>
              {isVideoEnabled ? (
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              )}
            </button>

            <button onClick={endCall} className="btn-end-call">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
              </svg>
              Finalizar
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default VideoCall;
