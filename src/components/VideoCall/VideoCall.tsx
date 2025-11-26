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

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<any>(null); // MediaConnection type
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    // Configurar listeners pero NO conectar aún
    signalingSocket.on("connect", () => {
      setIsConnected(true);
      console.log("✅ Conectado al servidor de signaling WebRTC");
    });

    signalingSocket.on("disconnect", () => {
      setIsConnected(false);
      console.log("❌ Desconectado del servidor de signaling");
    });

    signalingSocket.on("roomFull", (data) => {
      console.log("⚠️ Sala llena:", data.message);
      setRoomFull(true);
      alert(data.message);
      signalingSocket.disconnect();
    });

    signalingSocket.on("remotePeerId", (peerId: string) => {
      console.log("🆔 Peer ID remoto recibido:", peerId);
      setRemotePeerId(peerId);
    });

    signalingSocket.on("userDisconnected", () => {
      console.log("👋 Usuario remoto desconectado");
      endCall();
    });

    return () => {
      signalingSocket.off("connect");
      signalingSocket.off("disconnect");
      signalingSocket.off("roomFull");
      signalingSocket.off("remotePeerId");
      signalingSocket.off("userDisconnected");
      endCall();
      if (signalingSocket.connected) {
        signalingSocket.disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Efecto para llamar al peer remoto cuando se recibe su ID
  useEffect(() => {
    if (remotePeerId && peerRef.current && localStreamRef.current && !callRef.current) {
      console.log("📞 Llamando a peer remoto:", remotePeerId);
      const call = peerRef.current.call(remotePeerId, localStreamRef.current);
      callRef.current = call;
      
      call.on("stream", (remoteStream) => {
        console.log("📹 Stream remoto recibido en llamada saliente");
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
      });

      call.on("close", () => {
        console.log("📞 Llamada cerrada");
        endCall();
      });

      call.on("error", (err) => {
        console.error("❌ Error en la llamada:", err);
        alert("Error en la llamada: " + err.message);
      });
    }
  }, [remotePeerId]);

  const startCall = async () => {
    try {
      // Conectar al servidor de signaling si no está conectado
      if (!signalingSocket.connected) {
        signalingSocket.connect();
        // Esperar a que se conecte con timeout más largo
        await new Promise<void>((resolve, reject) => {
          if (signalingSocket.connected) {
            resolve();
          } else {
            const timeout = setTimeout(() => {
              reject(new Error("Timeout conectando al servidor"));
            }, 10000); // 10 segundos
            
            signalingSocket.once("connect", () => {
              clearTimeout(timeout);
              resolve();
            });
            
            signalingSocket.once("roomFull", () => {
              clearTimeout(timeout);
              reject(new Error("Sala llena"));
            });

            signalingSocket.once("connect_error", (error) => {
              clearTimeout(timeout);
              reject(new Error("Error de conexión: " + error.message));
            });
          }
        });
      }

      // Verificar si ya hay 2 usuarios antes de pedir permisos
      if (roomFull) {
        alert("La sala está llena. Solo se permiten 2 usuarios.");
        return;
      }

      console.log("📹 Solicitando acceso a cámara y micrófono...");

      // Obtener stream local (video y audio)
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      } catch (mediaError: any) {
        console.error("❌ Error al acceder a media devices:", mediaError);
        
        // Intentar solo con audio
        try {
          console.log("🔊 Intentando solo con audio...");
          stream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true,
          });
          alert("No se pudo acceder a la cámara. La llamada continuará solo con audio.");
        } catch (audioError) {
          alert("No se pudo acceder a la cámara ni al micrófono. Verifica los permisos en tu navegador.");
          if (signalingSocket.connected) {
            signalingSocket.disconnect();
          }
          return;
        }
      }

      localStreamRef.current = stream;

      // Mostrar video local
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setIsCallActive(true);

      // Crear peer connection con PeerJS
      const peer = new Peer({
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
          ],
        },
      });

      peerRef.current = peer;

      peer.on("open", (id) => {
        console.log("🆔 Mi Peer ID:", id);
        
        // Registrar el Peer ID en el servidor de signaling
        signalingSocket.emit("registerPeerId", id);
      });

      peer.on("call", (call) => {
        console.log("📞 Llamada entrante");
        // Responder automáticamente con nuestro stream
        call.answer(stream);
        callRef.current = call;
        
        call.on("stream", (remoteStream) => {
          console.log("📹 Stream remoto recibido");
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
          }
        });

        call.on("close", () => {
          console.log("📞 Llamada cerrada");
          endCall();
        });

        call.on("error", (err) => {
          console.error("❌ Error en la llamada:", err);
        });
      });

      peer.on("error", (err) => {
        console.error("❌ Error en peer:", err);
        alert("Error en la conexión peer: " + err.message);
        endCall();
      });

      peer.on("disconnected", () => {
        console.log("⚠️ Peer desconectado, intentando reconectar...");
        peer.reconnect();
      });

      peer.on("close", () => {
        console.log("🔒 Peer cerrado");
      });

    } catch (error: any) {
      console.error("❌ Error en startCall:", error);
      if (error.message !== "Sala llena") {
        alert("Error al iniciar la llamada: " + error.message);
      }
      if (signalingSocket.connected) {
        signalingSocket.disconnect();
      }
    }
  };

  const endCall = () => {
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

    // Desconectar del servidor de signaling
    if (signalingSocket.connected) {
      signalingSocket.disconnect();
    }

    setIsCallActive(false);
    setIsMuted(false);
    setIsVideoEnabled(true);
    setRemotePeerId(null);
    setRoomFull(false);
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
            <span className="status-indicator online">● Conectado</span>
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
          <video ref={remoteVideoRef} autoPlay playsInline />
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
