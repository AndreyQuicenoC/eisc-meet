import { useState, useEffect, useRef } from "react";
import Peer from "peerjs";
import { signalingSocket } from "../../lib/webrtc.config";
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

  useEffect(() => {
    // Configurar listeners de signaling socket
    const handleConnect = () => {
      setIsConnected(true);
      console.log("✅ Conectado al servidor de signaling WebRTC");
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      console.log("❌ Desconectado del servidor de signaling");
    };

    const handleRoomFull = (data: { message: string }) => {
      console.log("⚠️ Sala llena:", data.message);
      setRoomFull(true);
      alert(data.message);
      signalingSocket.disconnect();
    };

    const handleUserCount = (count: number) => {
      console.log("👥 Usuarios online:", count);
      setUsersOnline(count);
    };

    const handleRemotePeerId = (peerId: string) => {
      console.log("🆔 Peer ID remoto recibido:", peerId);
      setRemotePeerId(peerId);
    };

    const handleUserDisconnected = () => {
      console.log("👋 Usuario remoto desconectado");
      // Limpiar solo el peer remoto, no desconectar al usuario actual
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      if (callRef.current) {
        callRef.current.close();
        callRef.current = null;
      }
      setRemotePeerId(null);
      hasInitiatedCallRef.current = false;
    };

    signalingSocket.on("connect", handleConnect);
    signalingSocket.on("disconnect", handleDisconnect);
    signalingSocket.on("roomFull", handleRoomFull);
    signalingSocket.on("userCount", handleUserCount);
    signalingSocket.on("remotePeerId", handleRemotePeerId);
    signalingSocket.on("userDisconnected", handleUserDisconnected);

    return () => {
      signalingSocket.off("connect", handleConnect);
      signalingSocket.off("disconnect", handleDisconnect);
      signalingSocket.off("roomFull", handleRoomFull);
      signalingSocket.off("userCount", handleUserCount);
      signalingSocket.off("remotePeerId", handleRemotePeerId);
      signalingSocket.off("userDisconnected", handleUserDisconnected);
      
      // Cleanup solo si el componente se desmonta
      cleanupCall();
      if (signalingSocket.connected) {
        signalingSocket.disconnect();
      }
    };
  }, []);

  // Efecto para iniciar llamada cuando se recibe el Peer ID remoto
  useEffect(() => {
    if (!remotePeerId || !peerRef.current || !localStreamRef.current || hasInitiatedCallRef.current) {
      return;
    }

    const stream = localStreamRef.current;
    const peer = peerRef.current;
    
    // Prevenir múltiples llamadas
    hasInitiatedCallRef.current = true;

    console.log("📞 Iniciando llamada a peer remoto:", remotePeerId);
    logStreamInfo(stream, "local antes de llamar");

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
  }, [remotePeerId]);

  const logStreamInfo = (stream: MediaStream, label: string) => {
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    console.log(`📊 Stream ${label}:`)
    console.log(`  - Stream ID: ${stream.id}`);
    console.log(`  - Stream active: ${stream.active}`);
    console.log(`  - Video tracks: ${videoTracks.length}`);
    videoTracks.forEach((track, index) => {
      console.log(`    ${index + 1}. ${track.label || 'Video Track'}`);
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
      console.log(`    ${index + 1}. ${track.label || 'Audio Track'}`);
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
    call.on("stream", async (remoteStream: MediaStream) => {
      console.log("📹 Stream remoto recibido");
      logStreamInfo(remoteStream, "remoto recibido");
      
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        
        // Esperar un momento para que el navegador procese el stream
        await new Promise(resolve => setTimeout(resolve, 100));
        
        try {
          await remoteVideoRef.current.play();
          console.log("✅ Video remoto reproduciéndose correctamente");
        } catch (err: any) {
          console.error("❌ Error reproduciendo video remoto:", err);
          // Intentar nuevamente después de un momento
          setTimeout(async () => {
            try {
              await remoteVideoRef.current?.play();
              console.log("✅ Video remoto reproduciéndose en segundo intento");
            } catch (retryErr) {
              console.error("❌ Error en segundo intento:", retryErr);
            }
          }, 500);
        }
      }
    });

    call.on("close", () => {
      console.log("📞 Llamada cerrada por el otro usuario");
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      callRef.current = null;
      hasInitiatedCallRef.current = false;
    });

    call.on("error", (err: Error) => {
      console.error("❌ Error en la llamada:", err);
      hasInitiatedCallRef.current = false;
    });
  };

  const connectSignalingServer = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (signalingSocket.connected) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error("Timeout conectando al servidor de signaling"));
      }, 10000);

      const cleanup = () => {
        clearTimeout(timeout);
        signalingSocket.off("connect", onConnect);
        signalingSocket.off("roomFull", onRoomFull);
        signalingSocket.off("connect_error", onError);
      };

      const onConnect = () => {
        cleanup();
        resolve();
      };

      const onRoomFull = () => {
        cleanup();
        reject(new Error("Sala llena"));
      };

      const onError = (error: Error) => {
        cleanup();
        reject(new Error("Error de conexión: " + error.message));
      };

      signalingSocket.once("connect", onConnect);
      signalingSocket.once("roomFull", onRoomFull);
      signalingSocket.once("connect_error", onError);

      signalingSocket.connect();
    });
  };

  const getMediaStream = async (): Promise<MediaStream> => {
    try {
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
      
      logStreamInfo(stream, "local obtenido");
      return stream;
      
    } catch (videoError) {
      console.error("❌ Error con video:", videoError);
      
      try {
        console.log("🔊 Intentando solo con audio...");
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        
        alert("No se pudo acceder a la cámara. La llamada continuará solo con audio.");
        logStreamInfo(audioStream, "local (solo audio)");
        return audioStream;
        
      } catch (audioError) {
        throw new Error("No se pudo acceder a la cámara ni al micrófono. Verifica los permisos.");
      }
    }
  };

  const setupPeerConnection = (stream: MediaStream) => {
    const peer = new Peer({
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
      console.log("🆔 Mi Peer ID:", id);
      signalingSocket.emit("registerPeerId", id);
    });

    peer.on("call", (call) => {
      console.log("📞 Llamada entrante de:", call.peer);
      logStreamInfo(stream, "local para responder");
      
      call.answer(stream);
      
      if (!callRef.current) {
        callRef.current = call;
        hasInitiatedCallRef.current = true;
      }
      
      setupCallHandlers(call);
    });

    peer.on("error", (err) => {
      console.error("❌ Error en Peer:", err);
      if (err.type === "peer-unavailable") {
        console.log("⚠️ Peer no disponible, esperando...");
      } else {
        alert("Error en conexión Peer: " + err.message);
      }
    });

    peer.on("disconnected", () => {
      console.log("⚠️ Peer desconectado");
      // NO reconectar automáticamente, causa problemas
    });

    peer.on("close", () => {
      console.log("🔒 Peer cerrado");
    });

    return peer;
  };

  const startCall = async () => {
    try {
      if (roomFull) {
        alert("La sala está llena. Solo se permiten 2 usuarios.");
        return;
      }

      console.log("🚀 Iniciando llamada...");

      // 1. Conectar al servidor de signaling
      await connectSignalingServer();
      console.log("✅ Conectado al servidor de signaling");

      // 2. Obtener stream de media
      console.log("📹 Solicitando acceso a cámara y micrófono...");
      const stream = await getMediaStream();
      localStreamRef.current = stream;

      // 3. Mostrar video local
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        
        // Esperar un momento para que el navegador procese el stream
        await new Promise(resolve => setTimeout(resolve, 100));
        
        try {
          await localVideoRef.current.play();
          console.log("✅ Video local reproduciéndose correctamente");
        } catch (err: any) {
          console.error("❌ Error reproduciendo video local:", err);
          // El video local con muted normalmente no debería fallar
        }
      }

      // 4. Configurar PeerJS
      const peer = setupPeerConnection(stream);
      peerRef.current = peer;

      setIsCallActive(true);
      console.log("✅ Llamada iniciada exitosamente");

    } catch (error: any) {
      console.error("❌ Error en startCall:", error);
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
        console.log(`🔊 Audio ${audioTrack.enabled ? "activado" : "desactivado"}`);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        console.log(`📹 Video ${videoTrack.enabled ? "activado" : "desactivado"}`);
      }
    }
  };

  return (
    <div className="video-call-container">
      {/* Header */}
      <div className="video-header">
        <h3>Video Llamada</h3>
        <div className="status">
          {isConnected ? (
            <span className="status-indicator online">● Conectado ({usersOnline}/2)</span>
          ) : (
            <span className="status-indicator offline">● Desconectado</span>
          )}
        </div>
      </div>

      {roomFull && (
        <div className="room-full-warning">
          ⚠️ La sala está llena. Solo se permiten 2 usuarios.
        </div>
      )}

      {!isCallActive && !roomFull && (
        <div className="video-info">
          💡 <strong>Nota:</strong> Al iniciar la llamada, tu navegador pedirá permiso para acceder a la cámara y micrófono.
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
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline
            controls={false}
          />
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
            📞 Iniciar Llamada
          </button>
        ) : (
          <>
            <button
              onClick={toggleMute}
              className={`btn-control ${isMuted ? "muted" : ""}`}
              title={isMuted ? "Activar micrófono" : "Silenciar micrófono"}
            >
              {isMuted ? "🔇" : "🔊"}
            </button>

            <button
              onClick={toggleVideo}
              className={`btn-control ${!isVideoEnabled ? "disabled" : ""}`}
              title={isVideoEnabled ? "Desactivar cámara" : "Activar cámara"}
            >
              {isVideoEnabled ? "📹" : "📷"}
            </button>

            <button onClick={endCall} className="btn-end-call">
              📞 Finalizar
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default VideoCall;
