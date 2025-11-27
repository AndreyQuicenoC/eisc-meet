import { useState, useEffect, useRef, useCallback } from "react";
import Peer, { MediaConnection } from "peerjs";
import { signalingSocket } from "../../lib/webrtc.config";
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
  
  // ✅ NEW: Deduplication for incoming calls
  const activeCallPeerRef = useRef<string | null>(null); // Track which peer we're calling/called by

  // ============ HELPERS ============
  const logStreamInfo = useCallback((stream: MediaStream, label: string) => {
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    console.log(`📊 Stream ${label}: ${stream.id} (${videoTracks.length}V + ${audioTracks.length}A) active=${stream.active}`);
  }, []);

  // ============ ATTACH REMOTE STREAM ============
  const attachRemoteStream = useCallback(async (stream: MediaStream, fromPeerId: string) => {
    console.log(`🎬 Attaching remote stream from ${fromPeerId.substring(0, 8)}`);
    
    logStreamInfo(stream, `remote from ${fromPeerId.substring(0, 8)}`);

    if (!remoteVideoRef.current) {
      console.error("❌ remoteVideoRef is null!");
      return;
    }

    // ✅ CORRECCIÓN: Usar removeTrack en lugar de stop() para tracks remotos
    const oldStream = remoteVideoRef.current.srcObject as MediaStream;
    if (oldStream) {
      oldStream.getTracks().forEach((track) => {
        oldStream.removeTrack(track);
      });
    }

    // Set new stream
    remoteVideoRef.current.srcObject = stream;
    remoteVideoRef.current.muted = false;
    remoteVideoRef.current.volume = 1.0;

    // Wait for metadata with timeout
    await Promise.race([
      new Promise<boolean>((resolve) => {
        remoteVideoRef.current!.onloadedmetadata = () => {
          console.log(`✅ Metadata loaded: ${remoteVideoRef.current!.videoWidth}x${remoteVideoRef.current!.videoHeight}`);
          resolve(true);
        };
      }),
      new Promise<boolean>((resolve) => setTimeout(() => {
        console.warn("⏰ Metadata timeout, proceeding anyway");
        resolve(false);
      }, 2000))
    ]);

    // ✅ CORRECCIÓN: Retry logic mejorado para reproducción
    const playVideo = async (retries = 3): Promise<boolean> => {
      for (let i = 0; i < retries; i++) {
        try {
          await remoteVideoRef.current!.play();
          console.log("✅ Remote video playing");
          return true;
        } catch (err: unknown) {
          const error = err as Error;
          if (i === retries - 1) {
            console.warn(`⚠️ Play failed after ${retries} attempts:`, error.message);
          }
          if (i < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      }
      return false;
    };

    const played = await playVideo();
    
    if (!played) {
      console.log("👆 Waiting for user interaction to play video...");
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
    console.log(`🎯 Setting up call handlers for peer: ${call.peer.substring(0, 8)}`);

    call.on("stream", (remoteStream: MediaStream) => {
      console.log(`📥 Remote stream received from ${call.peer.substring(0, 8)}`);
      attachRemoteStream(remoteStream, call.peer);
    });

    call.on("close", () => {
      console.log(`📞 Call closed from ${call.peer.substring(0, 8)}`);
      
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
        activeCallPeerRef.current = null;
      }
    });

    call.on("error", (err: Error) => {
      console.error(`❌ Call error from ${call.peer.substring(0, 8)}:`, err.message);
      hasInitiatedCallRef.current = false;
      activeCallPeerRef.current = null;
    });
  }, [attachRemoteStream]);

  // ============ INITIATE OUTGOING CALL ============
  const initiateCall = useCallback((targetPeerId: string) => {
    console.log(`📞 Initiating call to ${targetPeerId.substring(0, 8)}`);

    // ✅ CORRECCIÓN: Validaciones robustas antes de iniciar llamada
    if (!peerRef.current || !isPeerReadyRef.current) {
      console.warn("⚠️ Peer not ready, storing for later");
      pendingRemotePeerIdRef.current = targetPeerId;
      return;
    }

    if (!localStreamRef.current) {
      console.error("❌ No local stream available");
      return;
    }

    if (hasInitiatedCallRef.current) {
      console.log("ℹ️ Call already initiated, skipping");
      return;
    }

    if (targetPeerId === myPeerIdRef.current) {
      console.warn("⚠️ Cannot call myself, ignoring");
      return;
    }

    // ✅ NEW: Check if we already have an active call with this peer
    if (activeCallPeerRef.current === targetPeerId) {
      console.log("ℹ️ Already have active call with this peer, skipping");
      return;
    }

    // ✅ CORRECCIÓN: Set flag BEFORE making call to prevent race conditions
    hasInitiatedCallRef.current = true;
    activeCallPeerRef.current = targetPeerId;

    console.log(`📤 Calling peer ${targetPeerId.substring(0, 8)} with local stream`);
    logStreamInfo(localStreamRef.current, "local for outgoing call");

    try {
      const call = peerRef.current.call(targetPeerId, localStreamRef.current);
      
      if (!call) {
        console.error("❌ Failed to create call");
        hasInitiatedCallRef.current = false;
        activeCallPeerRef.current = null;
        return;
      }

      callRef.current = call;
      setupCallHandlers(call);
      console.log("✅ Outgoing call initiated");
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("❌ Error creating call:", err.message);
      hasInitiatedCallRef.current = false;
      activeCallPeerRef.current = null;
    }
  }, [logStreamInfo, setupCallHandlers]);

  // ============ HANDLE INCOMING CALL ============
  const handleIncomingCall = useCallback((call: MediaConnection) => {
    console.log(`📞 Incoming call from ${call.peer.substring(0, 8)}`);

    // ✅ NEW: Prevent duplicate incoming calls
    if (activeCallPeerRef.current === call.peer) {
      console.log("ℹ️ Already have active call with this peer, ignoring duplicate incoming call");
      return;
    }

    if (callRef.current && callRef.current.peer === call.peer) {
      console.log("ℹ️ Already answering call from this peer, ignoring duplicate");
      return;
    }

    if (!localStreamRef.current) {
      console.error("❌ No local stream to answer with");
      return;
    }

    console.log(`📤 Answering call with local stream`);
    logStreamInfo(localStreamRef.current, "local to answer");

    call.answer(localStreamRef.current);

    // Only set callRef if we don't have one
    if (!callRef.current) {
      callRef.current = call;
      hasInitiatedCallRef.current = true;
      activeCallPeerRef.current = call.peer;
      console.log("✅ Call answered and stored");
    } else {
      console.log("ℹ️ Already have a call, not overwriting");
    }

    setupCallHandlers(call);
  }, [logStreamInfo, setupCallHandlers]);

  // ============ SETUP PEER CONNECTION ============
  const setupPeer = useCallback(() => {
    console.log("🔧 Setting up Peer");

    // ✅ FIXED CONFIGURATION FOR PRODUCTION - Heroku Backend
    console.log("🌐 Connecting to PeerServer: eisc-video-3ee1ac20d78b.herokuapp.com:443/peerjs");

    const peer = new Peer({
      host: "eisc-video-3ee1ac20d78b.herokuapp.com",
      port: 443,
      path: "/peerjs",
      secure: true,
      debug: 1, // reduced from 2 to minimize logs
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
      console.log(`✅ Peer opened with ID: ${id.substring(0, 8)}`);
      
      myPeerIdRef.current = id;
      isPeerReadyRef.current = true;

      // Register with signaling server
      console.log("📡 Registering Peer ID with signaling server");
      signalingSocket.emit("registerPeerId", id);

      // ✅ CORRECCIÓN: Check if we have a pending remote peer to call
      if (pendingRemotePeerIdRef.current) {
        console.log(`🔄 Initiating pending call to ${pendingRemotePeerIdRef.current.substring(0, 8)}`);
        const pending = pendingRemotePeerIdRef.current;
        pendingRemotePeerIdRef.current = null;
        
        // Delay to ensure remote peer is also ready
        setTimeout(() => {
          initiateCall(pending);
        }, 500);
      }
    });

    peer.on("call", handleIncomingCall);

    peer.on("error", (err) => {
      console.error(`❌ Peer error [${err.type}]: ${err.message}`);

      if (err.type === "peer-unavailable") {
        console.log("⚠️ Peer unavailable, will retry when available");
      } else {
        alert(`Error en conexión Peer: ${err.message}`);
      }
    });

    peer.on("disconnected", () => {
      console.warn("⚠️ Peer disconnected");
      isPeerReadyRef.current = false;
    });

    peer.on("close", () => {
      console.log("🔒 Peer closed");
      isPeerReadyRef.current = false;
    });

    return peer;
  }, [handleIncomingCall, initiateCall]);

  // ============ SETUP SOCKET LISTENERS ============
  useEffect(() => {
    console.log("🔌 Setting up Socket listeners");

    const handleConnect = () => {
      setIsConnected(true);
      console.log(`✅ Signaling connected (${signalingSocket.id})`);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      console.log("❌ Signaling disconnected");
    };

    const handleRoomFull = (data: { message: string }) => {
      console.log("⚠️ Room full");
      setRoomFull(true);
      alert(data.message);
      // Don't disconnect - let user handle it
    };

    const handleUserCount = (count: number) => {
      console.log(`👥 User count: ${count}`);
      setUsersOnline(count);
    };

    const handleRemotePeerId = (peerId: string) => {
      console.log(`🆔 Remote Peer ID received: ${peerId.substring(0, 8)}`);

      // Ignore our own peer ID
      if (peerId === myPeerIdRef.current) {
        console.log("⚠️ This is my own ID, ignoring");
        return;
      }

      setRemotePeerId(peerId);

      // ✅ CORRECCIÓN: Try to initiate call immediately if peer is ready
      if (isPeerReadyRef.current && !hasInitiatedCallRef.current && !activeCallPeerRef.current) {
        console.log("📞 Peer ready, initiating call");
        setTimeout(() => initiateCall(peerId), 500);
      } else {
        console.log("⏳ Peer not ready or call already active, storing for later");
        pendingRemotePeerIdRef.current = peerId;
      }
    };

    const handleUserDisconnected = () => {
      console.log("👋 Remote user disconnected");
      
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
      activeCallPeerRef.current = null;
    };

    const handleMediaToggle = (data: { type: "audio" | "video"; enabled: boolean; peerId: string }) => {
      console.log(`🔄 Remote media toggle: ${data.type}=${data.enabled}`);
    };

    const handleConnectError = (error: Error) => {
      console.error("❌ Socket connect error:", error.message);
    };

    // ✅ CORRECCIÓN: Solo configurar listeners, NO conectar aquí
    signalingSocket.on("connect", handleConnect);
    signalingSocket.on("disconnect", handleDisconnect);
    signalingSocket.on("connect_error", handleConnectError);
    signalingSocket.on("roomFull", handleRoomFull);
    signalingSocket.on("userCount", handleUserCount);
    signalingSocket.on("remotePeerId", handleRemotePeerId);
    signalingSocket.on("userDisconnected", handleUserDisconnected);
    signalingSocket.on("mediaToggle", handleMediaToggle);

    // Cleanup on unmount
    return () => {
      console.log("🧹 Cleaning up Socket listeners");
      
      signalingSocket.off("connect", handleConnect);
      signalingSocket.off("disconnect", handleDisconnect);
      signalingSocket.off("connect_error", handleConnectError);
      signalingSocket.off("roomFull", handleRoomFull);
      signalingSocket.off("userCount", handleUserCount);
      signalingSocket.off("remotePeerId", handleRemotePeerId);
      signalingSocket.off("userDisconnected", handleUserDisconnected);
      signalingSocket.off("mediaToggle", handleMediaToggle);
    };
  }, [initiateCall]);

  // ============ GET MEDIA STREAM ============
  const getMediaStream = useCallback(async (): Promise<MediaStream> => {
    console.log("🎥 Getting media stream");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      console.log("✅ Video + audio obtained");
      logStreamInfo(stream, "local obtained");
      return stream;
    } catch (videoError: unknown) {
      const error = videoError as Error;
      console.warn("⚠️ Video failed, trying audio only:", error.message);

      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });

        console.log("✅ Audio-only obtained");
        alert("No se pudo acceder a la cámara. La llamada continuará solo con audio.");
        logStreamInfo(audioStream, "local (audio only)");
        return audioStream;
      } catch (audioError: unknown) {
        const error = audioError as Error;
        console.error("❌ All media access failed:", error.message);
        throw new Error("No se pudo acceder a la cámara ni al micrófono. Verifica los permisos.");
      }
    }
  }, [logStreamInfo]);

  // ============ START CALL ============
  const startCall = useCallback(async () => {
    console.log("🚀 Starting call");

    if (roomFull) {
      alert("La sala está llena. Solo se permiten 2 usuarios.");
      return;
    }

    try {
      // ✅ CORRECCIÓN: Step 1 - Connect to signaling server ONLY if not connected
      if (!signalingSocket.connected) {
        console.log("📡 Connecting to signaling server");
        
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
            signalingSocket.off("connect", onConnect);
            signalingSocket.off("roomFull", onRoomFull);
            signalingSocket.off("connect_error", onError);
            reject(new Error("Sala llena"));
          };
          
          const onError = (err: Error) => {
            clearTimeout(timeout);
            signalingSocket.off("connect", onConnect);
            signalingSocket.off("roomFull", onRoomFull);
            signalingSocket.off("connect_error", onError);
            reject(err);
          };

          signalingSocket.once("connect", onConnect);
          signalingSocket.once("roomFull", onRoomFull);
          signalingSocket.once("connect_error", onError);
          
          signalingSocket.connect();
        });

        console.log("✅ Connected to signaling");
      } else {
        console.log("ℹ️ Already connected to signaling");
      }

      // Step 2: Get media stream
      console.log("📹 Getting media stream");
      const stream = await getMediaStream();
      localStreamRef.current = stream;
      console.log(`✅ Got ${stream.getVideoTracks().length}V + ${stream.getAudioTracks().length}A`);

      // Step 3: Display local video
      console.log("🎥 Displaying local video");
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await new Promise(resolve => setTimeout(resolve, 100));
        
        try {
          await localVideoRef.current.play();
          console.log("✅ Local video playing");
        } catch (err: unknown) {
          const error = err as Error;
          console.warn("⚠️ Local video autoplay failed:", error.message);
        }
      }

      // Step 4: Setup PeerJS
      console.log("🔗 Setting up PeerJS");
      const peer = setupPeer();
      peerRef.current = peer;

      setIsCallActive(true);
      console.log("✅ Call setup complete");
    } catch (error: unknown) {
      const err = error as Error;
      console.error("❌ Call setup failed:", err.message);
      alert(`Error al iniciar la llamada: ${err.message}`);

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
    console.log("🛑 Ending call");

    // Close call
    if (callRef.current) {
      callRef.current.close();
      callRef.current = null;
    }

    // Destroy peer
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }

    // Stop local media
    if (localStreamRef.current) {
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
    activeCallPeerRef.current = null;

    // Disconnect from signaling
    if (signalingSocket.connected) {
      signalingSocket.disconnect();
    }

    // ✅ CORRECCIÓN: Reset UI state pero NO estado del servidor (usersOnline/roomFull)
    setIsCallActive(false);
    setIsMuted(false);
    setIsVideoEnabled(true);
    setRemotePeerId(null);
    // NO resetear: usersOnline, roomFull (esos vienen del servidor)

    console.log("✅ Call ended and cleaned up");
  }, []);

  // ============ TOGGLE MUTE ============
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;

    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
      
      console.log(`🔊 Audio ${audioTrack.enabled ? "enabled" : "muted"}`);

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
      
      console.log(`📹 Video ${videoTrack.enabled ? "enabled" : "disabled"}`);

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
      console.log("🧹 Component unmounting - cleanup");
      
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
