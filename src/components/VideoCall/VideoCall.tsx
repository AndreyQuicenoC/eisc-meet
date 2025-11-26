import { useState, useEffect, useRef } from "react";
import SimplePeer from "simple-peer";
import { signalingSocket, iceServersConfig } from "../../lib/webrtc.config";
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
  const peerRef = useRef<SimplePeer.Instance | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const signalQueueRef = useRef<SimplePeer.SignalData[]>([]);

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

    signalingSocket.on("introduction", (peers: string[]) => {
      console.log("👥 Peers actuales:", peers);
      // Si hay otro peer conectado, guardar su ID
      if (peers.length > 0) {
        const otherPeer = peers.find((id) => id !== signalingSocket.id);
        if (otherPeer) {
          setRemotePeerId(otherPeer);
        }
      }
    });

    signalingSocket.on("newUserConnected", (peerId: string) => {
      console.log("👤 Nuevo usuario conectado:", peerId);
      if (peerId !== signalingSocket.id) {
        setRemotePeerId(peerId);
      }
    });

    signalingSocket.on("signal", (_to: string, from: string, signal: SimplePeer.SignalData) => {
      console.log("📡 Señal recibida de:", from);
      if (peerRef.current) {
        try {
          peerRef.current.signal(signal);
        } catch (err) {
          console.error("Error procesando señal:", err);
        }
      } else {
        // Guardar señal para procesarla después
        signalQueueRef.current.push(signal);
      }
    });

    signalingSocket.on("userDisconnected", (peerId: string) => {
      console.log("👋 Usuario desconectado:", peerId);
      if (peerId === remotePeerId) {
        endCall();
      }
    });

    return () => {
      signalingSocket.off("connect");
      signalingSocket.off("disconnect");
      signalingSocket.off("roomFull");
      signalingSocket.off("introduction");
      signalingSocket.off("newUserConnected");
      signalingSocket.off("signal");
      signalingSocket.off("userDisconnected");
      endCall();
      if (signalingSocket.connected) {
        signalingSocket.disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCall = async () => {
    try {
      // Conectar al servidor de signaling si no está conectado
      if (!signalingSocket.connected) {
        signalingSocket.connect();
        // Esperar a que se conecte
        await new Promise<void>((resolve, reject) => {
          if (signalingSocket.connected) {
            resolve();
          } else {
            const timeout = setTimeout(() => {
              reject(new Error("Timeout conectando al servidor"));
            }, 5000);
            
            signalingSocket.once("connect", () => {
              clearTimeout(timeout);
              resolve();
            });
            
            signalingSocket.once("roomFull", () => {
              clearTimeout(timeout);
              reject(new Error("Sala llena"));
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

      // Esperar un momento para que se establezca remotePeerId
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Determinar si somos el initiator (si ya hay alguien conectado)
      const isInitiator = remotePeerId !== null;

      console.log(`🎬 Iniciando peer como ${isInitiator ? 'INITIATOR' : 'RECEIVER'}`);

      // Crear peer connection
      const peer = new SimplePeer({
        initiator: isInitiator,
        stream: stream,
        config: iceServersConfig,
        trickle: true,
      });

      peerRef.current = peer;

      // Procesar señales en cola
      if (signalQueueRef.current.length > 0) {
        console.log(`📥 Procesando ${signalQueueRef.current.length} señales en cola`);
        signalQueueRef.current.forEach(signal => {
          try {
            peer.signal(signal);
          } catch (err) {
            console.error("Error procesando señal en cola:", err);
          }
        });
        signalQueueRef.current = [];
      }

      peer.on("signal", (signal) => {
        console.log("📤 Enviando señal...");
        if (remotePeerId) {
          signalingSocket.emit("signal", remotePeerId, signalingSocket.id, signal);
        } else {
          console.log("⏳ Esperando peer remoto para enviar señal...");
          // Esperar a que llegue el peer remoto
          const waitForRemote = setInterval(() => {
            if (remotePeerId) {
              console.log("✅ Peer remoto detectado, enviando señal");
              signalingSocket.emit("signal", remotePeerId, signalingSocket.id, signal);
              clearInterval(waitForRemote);
            }
          }, 500);
          // Timeout después de 10 segundos
          setTimeout(() => clearInterval(waitForRemote), 10000);
        }
      });

      peer.on("stream", (remoteStream) => {
        console.log("📹 Stream remoto recibido");
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
      });

      peer.on("connect", () => {
        console.log("🔗 Conexión peer-to-peer establecida");
      });

      peer.on("error", (err) => {
        console.error("❌ Error en peer connection:", err);
        alert("Error en la conexión de video. Por favor, intenta de nuevo.");
        endCall();
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
    // Detener peer connection
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
