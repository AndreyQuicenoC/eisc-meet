import { useState, useEffect, useRef } from "react";
import Peer from "peerjs";
import { signalingSocket } from "../../lib/webrtc.config";
import { SIGNALING_URL } from "../../lib/env.config";
import "./VideoCall.scss";

const VideoCall: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [remotePeerId, setRemotePeerId] = useState<string | null>(null);
  const [roomFull, setRoomFull] = useState(false);
  const [usersOnline, setUsersOnline] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const hasInitiatedCallRef = useRef(false);
  const myPeerIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Configurar listeners de signaling socket
    const handleConnect = () => {
      setIsConnected(true);
      console.log(
        "%c✅ SIGNALING SOCKET CONNECTED",
        "color: green; font-weight: bold"
      );
      console.log("  Socket ID:", signalingSocket.id);
      console.log("  Transport:", signalingSocket.io.engine.transport.name);
      console.log("  URL:", SIGNALING_URL);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      console.log(
        "%c❌ SIGNALING SOCKET DISCONNECTED",
        "color: red; font-weight: bold"
      );
    };

    const handleRoomFull = (data: { message: string }) => {
      console.log(
        "%c⚠️ ROOM FULL",
        "color: orange; font-weight: bold",
        data.message
      );
      setRoomFull(true);
      alert(data.message);
      signalingSocket.disconnect();
    };

    const handleUserCount = (count: number) => {
      console.log("%c👥 USER COUNT UPDATE", "color: blue; font-weight: bold");
      console.log("  Users online:", count);
      console.log("  Time:", new Date().toISOString());
      setUsersOnline(count);
    };

    const handleRemotePeerId = (peerId: string) => {
      console.log(
        "%c🆔 REMOTE PEER ID RECEIVED",
        "color: purple; font-weight: bold"
      );
      console.log("  Remote Peer ID:", peerId);
      console.log("  My Peer ID:", myPeerIdRef.current);

      // Evitar procesar nuestro propio Peer ID
      if (peerId === myPeerIdRef.current) {
        console.log("%c⚠️ IGNORED - This is my own Peer ID", "color: orange");
        return;
      }

      console.log("  Setting remote peer ID...");
      setRemotePeerId(peerId);
    };

    const handleUserDisconnected = () => {
      console.log(
        "%c👋 REMOTE USER DISCONNECTED",
        "color: orange; font-weight: bold"
      );
      // Limpiar solo el peer remoto, no desconectar al usuario actual
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
        console.log("  Cleared remote video");
      }
      if (callRef.current) {
        callRef.current.close();
        callRef.current = null;
        console.log("  Closed call");
      }
      setRemotePeerId(null);
      hasInitiatedCallRef.current = false;
    };

    const handleMediaToggle = (data: { type: "audio" | "video"; enabled: boolean; peerId: string }) => {
      console.log(
        "%c🔄 REMOTE MEDIA TOGGLE",
        "color: purple; font-weight: bold"
      );
      console.log("  Type:", data.type.toUpperCase());
      console.log("  Enabled:", data.enabled ? "✅ ON" : "❌ OFF");
      console.log("  From Peer:", data.peerId);
      console.log("  Time:", new Date().toISOString());
      
      // This info is already reflected in the track events, but logging helps debugging
      console.log("  ℹ️ Remote user toggled their", data.type);
    };

    signalingSocket.on("connect", handleConnect);
    signalingSocket.on("disconnect", handleDisconnect);
    signalingSocket.on("roomFull", handleRoomFull);
    signalingSocket.on("userCount", handleUserCount);
    signalingSocket.on("remotePeerId", handleRemotePeerId);
    signalingSocket.on("userDisconnected", handleUserDisconnected);
    signalingSocket.on("mediaToggle", handleMediaToggle);

    return () => {
      signalingSocket.off("connect", handleConnect);
      signalingSocket.off("disconnect", handleDisconnect);
      signalingSocket.off("roomFull", handleRoomFull);
      signalingSocket.off("userCount", handleUserCount);
      signalingSocket.off("remotePeerId", handleRemotePeerId);
      signalingSocket.off("userDisconnected", handleUserDisconnected);
      signalingSocket.off("mediaToggle", handleMediaToggle);

      // Cleanup solo si el componente se desmonta
      cleanupCall();
      if (signalingSocket.connected) {
        signalingSocket.disconnect();
      }
    };
  }, []);

  // Efecto para iniciar llamada cuando se recibe el Peer ID remoto
  useEffect(() => {
    if (
      !remotePeerId ||
      !peerRef.current ||
      !localStreamRef.current ||
      hasInitiatedCallRef.current
    ) {
      return;
    }

    const stream = localStreamRef.current;
    const peer = peerRef.current;

    // Prevenir múltiples llamadas
    hasInitiatedCallRef.current = true;

    console.log("📞 Iniciando llamada a peer remoto:", remotePeerId);
    logStreamInfo(stream, "local antes de llamar");

    // Esperar un momento para asegurar que el peer remoto está listo
    setTimeout(() => {
      try {
        const call = peer.call(remotePeerId, stream);

        if (!call) {
          console.error("❌ No se pudo crear la llamada");
          hasInitiatedCallRef.current = false;
          return;
        }

        callRef.current = call;
        setupCallHandlers(call);
      } catch (error) {
        console.error("❌ Error al iniciar llamada:", error);
        hasInitiatedCallRef.current = false;
      }
    }, 500); // Delay de 500ms para asegurar que el peer remoto esté listo
  }, [remotePeerId]);

  const logStreamInfo = (stream: MediaStream, label: string) => {
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    console.log(`📊 Stream ${label}:`);
    console.log(`  - Stream ID: ${stream.id}`);
    console.log(`  - Stream active: ${stream.active}`);
    console.log(`  - Video tracks: ${videoTracks.length}`);
    videoTracks.forEach((track, index) => {
      console.log(`    ${index + 1}. ${track.label || "Video Track"}`);
      console.log(`       - ID: ${track.id}`);
      console.log(`       - Enabled: ${track.enabled}`);
      console.log(`       - ReadyState: ${track.readyState}`);
      console.log(`       - Muted: ${track.muted}`);
      const settings = track.getSettings();
      console.log(`       - Resolution: ${settings.width}x${settings.height}`);
      console.log(`       - FrameRate: ${settings.frameRate}`);
    });
    console.log(`  - Audio tracks: ${audioTracks.length}`);
    audioTracks.forEach((track, index) => {
      console.log(`    ${index + 1}. ${track.label || "Audio Track"}`);
      console.log(`       - ID: ${track.id}`);
      console.log(`       - Enabled: ${track.enabled}`);
      console.log(`       - ReadyState: ${track.readyState}`);
      console.log(`       - Muted: ${track.muted}`);
      const settings = track.getSettings();
      console.log(`       - SampleRate: ${settings.sampleRate}`);
      console.log(`       - ChannelCount: ${settings.channelCount}`);
    });
  };

  const setupCallHandlers = (call: any) => {
    console.log(
      "%c🎯 SETTING UP CALL HANDLERS",
      "color: cyan; font-weight: bold"
    );
    console.log("  For Peer ID:", call.peer);
    console.log("  Time:", new Date().toISOString());

    call.on("stream", async (remoteStream: MediaStream) => {
      console.log(
        "%c🎬 REMOTE STREAM RECEIVED",
        "color: green; font-size: 14px; font-weight: bold"
      );
      console.log("  From Peer ID:", call.peer);
      console.log("  Time:", new Date().toISOString());

      logStreamInfo(remoteStream, "remoto recibido");

      // Setup track event listeners for remote stream
      console.log("  🎧 Setting up track event listeners...");
      remoteStream.getTracks().forEach((track) => {
        console.log(`    - Setting up listeners for ${track.kind} track`);
        
        track.onended = () => {
          console.log(`%c📴 REMOTE ${track.kind.toUpperCase()} TRACK ENDED`, "color: red; font-weight: bold");
          console.log("  Track ID:", track.id);
          console.log("  Time:", new Date().toISOString());
        };
        
        track.onmute = () => {
          console.log(`%c🔇 REMOTE ${track.kind.toUpperCase()} TRACK MUTED`, "color: orange; font-weight: bold");
          console.log("  Track ID:", track.id);
          console.log("  Time:", new Date().toISOString());
        };
        
        track.onunmute = () => {
          console.log(`%c🔊 REMOTE ${track.kind.toUpperCase()} TRACK UNMUTED`, "color: green; font-weight: bold");
          console.log("  Track ID:", track.id);
          console.log("  Time:", new Date().toISOString());
        };
      });
      console.log("  ✅ Track event listeners configured");

      if (remoteVideoRef.current) {
        // Clear any existing stream first
        if (remoteVideoRef.current.srcObject) {
          const oldStream = remoteVideoRef.current.srcObject as MediaStream;
          console.log("  🛑 Stopping old stream tracks...");
          oldStream.getTracks().forEach((track) => {
            console.log("    - Stopping", track.kind, "track");
            track.stop();
          });
          console.log("  ✅ Old stream tracks stopped");
        }

        console.log("  🔗 Setting remote stream to video element...");
        remoteVideoRef.current.srcObject = remoteStream;

        // Force video attributes
        remoteVideoRef.current.muted = false;
        remoteVideoRef.current.volume = 1.0;
        console.log("  🔊 Video attributes set (muted=false, volume=1.0)");

        // Wait for metadata to load
        console.log("  ⏳ Waiting for video metadata...");
        await new Promise((resolve) => {
          remoteVideoRef.current!.onloadedmetadata = () => {
            console.log("  ✅ Video metadata loaded");
            console.log(
              "    - Dimensions:",
              remoteVideoRef.current!.videoWidth,
              "x",
              remoteVideoRef.current!.videoHeight
            );
            console.log("    - Duration:", remoteVideoRef.current!.duration);
            console.log(
              "    - Ready state:",
              remoteVideoRef.current!.readyState
            );
            resolve(true);
          };

          // Timeout de seguridad
          setTimeout(() => {
            console.warn("  ⏰ Metadata timeout after 2s, proceeding anyway");
            resolve(false);
          }, 2000);
        });

        try {
          console.log("  ▶️ Attempting to play remote video...");
          await remoteVideoRef.current.play();
          console.log(
            "%c  ✅ REMOTE VIDEO PLAYING",
            "color: green; font-weight: bold"
          );
        } catch (err: any) {
          console.error(
            "%c  ❌ ERROR PLAYING REMOTE VIDEO",
            "color: red; font-weight: bold"
          );
          console.error("    Error name:", err.name);
          console.error("    Error message:", err.message);
          console.error("    Full error:", err);

          // Try with user interaction
          const playWithInteraction = () => {
            console.log("  🖱️ Attempting to play with user interaction...");
            remoteVideoRef.current
              ?.play()
              .then(() => {
                console.log("  ✅ Remote video playing after user interaction");
                document.removeEventListener("click", playWithInteraction);
              })
              .catch((retryErr) => {
                console.error("  ❌ Retry failed:", retryErr);
              });
          };

          // Add click listener to retry play on user interaction
          document.addEventListener("click", playWithInteraction, {
            once: true,
          });
          console.log("  👆 Waiting for user click to play video");
        }
      } else {
        console.error(
          "%c  ❌ remoteVideoRef.current is null!",
          "color: red; font-weight: bold"
        );
        console.error("    Cannot display remote video - ref not available");
      }
    });

    call.on("close", () => {
      console.log("%c📞 CALL CLOSED", "color: red; font-weight: bold");
      console.log("  By remote peer:", call.peer);
      console.log("  Time:", new Date().toISOString());

      if (remoteVideoRef.current) {
        console.log("  Clearing remote video element...");
        remoteVideoRef.current.srcObject = null;
      }
      callRef.current = null;
      hasInitiatedCallRef.current = false;
      console.log("  ✅ Call references cleared");
    });

    call.on("error", (err: Error) => {
      console.error("%c❌ CALL ERROR", "color: red; font-weight: bold");
      console.error("  Peer ID:", call.peer);
      console.error("  Error:", err.message);
      console.error("  Full error:", err);
      console.error("  Time:", new Date().toISOString());

      hasInitiatedCallRef.current = false;
      console.log("  Reset hasInitiatedCallRef to false");
    });

    console.log("  ✅ All call handlers configured");
  };

  const connectSignalingServer = (): Promise<void> => {
    console.log(
      "%c🔌 CONNECTING TO SIGNALING SERVER",
      "color: purple; font-weight: bold"
    );
    console.log("  Time:", new Date().toISOString());
    console.log("  Server URL:", SIGNALING_URL);

    return new Promise((resolve, reject) => {
      if (signalingSocket.connected) {
        console.log("  ℹ️ Already connected, resolving immediately");
        resolve();
        return;
      }

      console.log("  ⏳ Setting up connection handlers...");
      const timeout = setTimeout(() => {
        console.error("  ❌ Connection timeout after 10s");
        reject(new Error("Timeout conectando al servidor de signaling"));
      }, 10000);

      const cleanup = () => {
        clearTimeout(timeout);
        signalingSocket.off("connect", onConnect);
        signalingSocket.off("roomFull", onRoomFull);
        signalingSocket.off("connect_error", onError);
      };

      const onConnect = () => {
        console.log(
          "%c  ✅ CONNECTED TO SIGNALING SERVER",
          "color: green; font-weight: bold"
        );
        console.log("    Socket ID:", signalingSocket.id);
        console.log("    Time:", new Date().toISOString());
        cleanup();
        resolve();
      };

      const onRoomFull = () => {
        console.error("%c  ❌ ROOM IS FULL", "color: red; font-weight: bold");
        console.log("    Time:", new Date().toISOString());
        cleanup();
        reject(new Error("Sala llena"));
      };

      const onError = (error: Error) => {
        console.error(
          "%c  ❌ CONNECTION ERROR",
          "color: red; font-weight: bold"
        );
        console.error("    Error:", error.message);
        console.error("    Full error:", error);
        console.error("    Time:", new Date().toISOString());
        cleanup();
        reject(new Error("Error de conexión: " + error.message));
      };

      signalingSocket.once("connect", onConnect);
      signalingSocket.once("roomFull", onRoomFull);
      signalingSocket.once("connect_error", onError);

      console.log("  📡 Initiating connection...");
      signalingSocket.connect();
    });
  };

  const getMediaStream = async (): Promise<MediaStream> => {
    console.log("%c🎥 GETTING MEDIA STREAM", "color: blue; font-weight: bold");
    console.log("  Time:", new Date().toISOString());
    console.log("  Requesting permissions...");

    try {
      console.log("  📹 Attempting video + audio...");
      console.log("    Video constraints: 1280x720 (ideal)");
      console.log(
        "    Audio: echoCancellation, noiseSuppression, autoGainControl"
      );

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      console.log(
        "%c  ✅ VIDEO + AUDIO STREAM OBTAINED",
        "color: green; font-weight: bold"
      );
      logStreamInfo(stream, "local obtenido");
      return stream;
    } catch (videoError: any) {
      console.error(
        "%c  ❌ VIDEO ACCESS ERROR",
        "color: red; font-weight: bold"
      );
      console.error("    Error name:", videoError.name);
      console.error("    Error message:", videoError.message);
      console.error("    Full error:", videoError);

      try {
        console.log("  🔊 FALLBACK: Attempting audio only...");
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        console.log(
          "%c  ✅ AUDIO-ONLY STREAM OBTAINED",
          "color: yellow; font-weight: bold"
        );
        alert(
          "No se pudo acceder a la cámara. La llamada continuará solo con audio."
        );
        logStreamInfo(audioStream, "local (solo audio)");
        return audioStream;
      } catch (audioError: any) {
        console.error(
          "%c  ❌ AUDIO ACCESS ERROR",
          "color: red; font-weight: bold"
        );
        console.error("    Error name:", audioError.name);
        console.error("    Error message:", audioError.message);
        console.error("    Full error:", audioError);
        throw new Error(
          "No se pudo acceder a la cámara ni al micrófono. Verifica los permisos."
        );
      }
    }
  };

  const setupPeerConnection = (stream: MediaStream) => {
    console.log(
      "%c🔧 SETTING UP PEER CONNECTION",
      "color: purple; font-weight: bold"
    );
    console.log("  Time:", new Date().toISOString());
    console.log("  Signaling URL:", SIGNALING_URL);
    
    // Extract host and port from SIGNALING_URL
    const url = new URL(SIGNALING_URL);
    const host = url.hostname;
    const port = url.port || (url.protocol === "https:" ? 443 : 80);
    const secure = url.protocol === "https:";
    
    console.log("  PeerJS Config:");
    console.log("    - Host:", host);
    console.log("    - Port:", port);
    console.log("    - Path: /peerjs");
    console.log("    - Secure:", secure);
    console.log("  ICE Servers configured:", 5);

    const peer = new Peer({
      host: host,
      port: parseInt(port.toString()),
      path: "/peerjs",
      secure: secure,
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
      console.log("  🆔 My Peer ID:", id);
      console.log("  Time:", new Date().toISOString());
      console.log("  Registering with signaling server...");

      myPeerIdRef.current = id;
      signalingSocket.emit("registerPeerId", id);

      console.log("  ✅ Peer ID registered");
    });

    peer.on("call", (call) => {
      console.log("%c📞 INCOMING CALL", "color: orange; font-weight: bold");
      console.log("  From Peer ID:", call.peer);
      console.log("  My Peer ID:", myPeerIdRef.current);
      console.log("  Time:", new Date().toISOString());

      logStreamInfo(stream, "local para responder");

      // Answer with local stream
      console.log("  Answering call with local stream...");
      call.answer(stream);
      console.log("  ✅ Call answered");

      // Only set callRef if we don't have one already
      if (!callRef.current) {
        callRef.current = call;
        hasInitiatedCallRef.current = true;
        console.log("  📝 CallRef set for incoming call");
      } else {
        console.log("  ℹ️ CallRef already exists, not overwriting");
      }

      // Setup handlers for this call
      console.log("  Setting up call handlers...");
      setupCallHandlers(call);
    });

    peer.on("error", (err) => {
      console.error("%c❌ PEER ERROR", "color: red; font-weight: bold");
      console.error("  Error type:", err.type);
      console.error("  Error message:", err.message);
      console.error("  Full error:", err);
      console.error("  Time:", new Date().toISOString());

      if (err.type === "peer-unavailable") {
        console.log("  ⚠️ Peer unavailable, will wait...");
      } else {
        alert("Error en conexión Peer: " + err.message);
      }
    });

    peer.on("disconnected", () => {
      console.warn(
        "%c⚠️ PEER DISCONNECTED",
        "color: orange; font-weight: bold"
      );
      console.log("  My Peer ID:", myPeerIdRef.current);
      console.log("  Time:", new Date().toISOString());
      console.log("  ℹ️ NOT auto-reconnecting (to avoid issues)");
      // NO reconectar automáticamente, causa problemas
    });

    peer.on("close", () => {
      console.log("%c🔒 PEER CLOSED", "color: red; font-weight: bold");
      console.log("  My Peer ID:", myPeerIdRef.current);
      console.log("  Time:", new Date().toISOString());
    });

    console.log("  ✅ Peer connection setup complete, waiting for events...");
    return peer;
  };

  const startCall = async () => {
    try {
      console.log(
        "%c🚀 STARTING CALL",
        "color: green; font-size: 16px; font-weight: bold"
      );
      console.log("  Time:", new Date().toISOString());
      console.log("  Room full status:", roomFull);

      if (roomFull) {
        alert("La sala está llena. Solo se permiten 2 usuarios.");
        return;
      }

      // 1. Conectar al servidor de signaling
      console.log(
        "%c📡 STEP 1: Connecting to signaling server",
        "color: blue; font-weight: bold"
      );
      await connectSignalingServer();
      console.log("  ✅ Connected to signaling server");

      // 2. Obtener stream de media
      console.log(
        "%c📹 STEP 2: Requesting media stream",
        "color: blue; font-weight: bold"
      );
      const stream = await getMediaStream();
      localStreamRef.current = stream;
      console.log("  ✅ Media stream obtained");
      console.log("  Video tracks:", stream.getVideoTracks().length);
      console.log("  Audio tracks:", stream.getAudioTracks().length);

      // 3. Mostrar video local
      console.log(
        "%c🎥 STEP 3: Setting up local video",
        "color: blue; font-weight: bold"
      );
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;

        // Esperar un momento para que el navegador procese el stream
        await new Promise((resolve) => setTimeout(resolve, 100));

        try {
          await localVideoRef.current.play();
          console.log("  ✅ Local video playing");
        } catch (err: any) {
          console.error("  ❌ Error playing local video:", err);
        }
      } else {
        console.error("  ❌ localVideoRef.current is null!");
      }

      // 4. Configurar PeerJS
      console.log(
        "%c🔗 STEP 4: Setting up PeerJS",
        "color: blue; font-weight: bold"
      );
      const peer = setupPeerConnection(stream);
      peerRef.current = peer;

      setIsCallActive(true);
      console.log(
        "%c✅ CALL STARTED SUCCESSFULLY",
        "color: green; font-size: 16px; font-weight: bold"
      );
      console.log("  Waiting for Peer ID...");
    } catch (error: any) {
      console.error(
        "%c❌ ERROR STARTING CALL",
        "color: red; font-size: 16px; font-weight: bold"
      );
      console.error("  Error:", error.message);
      console.error("  Stack:", error.stack);
      alert("Error al iniciar la llamada: " + error.message);

      // Cleanup en caso de error
      cleanupCall();
      if (signalingSocket.connected) {
        signalingSocket.disconnect();
      }
    }
  };

  const cleanupCall = () => {
    console.log("🧹 Limpiando recursos...");

    // Cerrar llamada
    if (callRef.current) {
      callRef.current.close();
      callRef.current = null;
    }

    // Destruir peer
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }

    // Detener stream local
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Limpiar videos
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    hasInitiatedCallRef.current = false;
  };

  const endCall = () => {
    cleanupCall();

    // Desconectar del servidor de signaling
    if (signalingSocket.connected) {
      signalingSocket.disconnect();
    }

    setIsCallActive(false);
    setIsMuted(false);
    setIsVideoEnabled(true);
    setRemotePeerId(null);
    setRoomFull(false);
    setUsersOnline(0);
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        console.log("%c🔊 AUDIO TOGGLED", "color: cyan; font-weight: bold");
        console.log("  Status:", audioTrack.enabled ? "ENABLED ✅" : "MUTED 🔇");
        console.log("  Track ID:", audioTrack.id);
        console.log("  Track state:", audioTrack.readyState);
        console.log("  Time:", new Date().toISOString());
        
        // Notify signaling server about audio toggle
        if (signalingSocket.connected) {
          console.log("  📤 Notifying signaling server about audio change");
          signalingSocket.emit("mediaToggle", {
            type: "audio",
            enabled: audioTrack.enabled,
            peerId: myPeerIdRef.current
          });
        }
      } else {
        console.log("%c⚠️ NO AUDIO TRACK", "color: orange; font-weight: bold");
      }
    } else {
      console.log("%c⚠️ NO LOCAL STREAM", "color: orange; font-weight: bold");
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        console.log("%c📹 VIDEO TOGGLED", "color: magenta; font-weight: bold");
        console.log("  Status:", videoTrack.enabled ? "ENABLED ✅" : "DISABLED 📴");
        console.log("  Track ID:", videoTrack.id);
        console.log("  Track state:", videoTrack.readyState);
        console.log("  Time:", new Date().toISOString());
        
        // Notify signaling server about video toggle
        if (signalingSocket.connected) {
          console.log("  📤 Notifying signaling server about video change");
          signalingSocket.emit("mediaToggle", {
            type: "video",
            enabled: videoTrack.enabled,
            peerId: myPeerIdRef.current
          });
        }
      } else {
        console.log("%c⚠️ NO VIDEO TRACK", "color: orange; font-weight: bold");
      }
    } else {
      console.log("%c⚠️ NO LOCAL STREAM", "color: orange; font-weight: bold");
    }
  };

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
          <svg
            className="warning-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          La sala está llena. Solo se permiten 2 usuarios.
        </div>
      )}

      {!isCallActive && !roomFull && (
        <div className="video-info">
          <svg
            className="info-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <strong>Nota:</strong> Al iniciar la llamada, tu navegador pedirá
          permiso para acceder a la cámara y micrófono.
        </div>
      )}

      {/* Video panels */}
      <div className="video-panels">
        <div className="video-panel local">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className={!isVideoEnabled ? "video-disabled" : ""}
          />
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
          <button
            onClick={startCall}
            disabled={roomFull}
            className="btn-start-call"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
              />
            </svg>
            Iniciar Llamada
          </button>
        ) : (
          <>
            <button
              onClick={toggleMute}
              className={`btn-control ${isMuted ? "muted" : ""}`}
              title={isMuted ? "Activar micrófono" : "Silenciar micrófono"}
            >
              {isMuted ? (
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                  />
                </svg>
              ) : (
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                </svg>
              )}
            </button>

            <button
              onClick={toggleVideo}
              className={`btn-control ${!isVideoEnabled ? "disabled" : ""}`}
              title={isVideoEnabled ? "Desactivar cámara" : "Activar cámara"}
            >
              {isVideoEnabled ? (
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              ) : (
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                  />
                </svg>
              )}
            </button>

            <button onClick={endCall} className="btn-end-call">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"
                />
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
