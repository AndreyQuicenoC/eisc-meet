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
  const myPeerIdRef = useRef<string | null>(null);

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
      
      // Evitar procesar nuestro propio Peer ID
      if (peerId === myPeerIdRef.current) {
        console.log("⚠️ Ignorando mi propio Peer ID");
        return;
      }
      
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
    console.log("📝 Configurando handlers para la llamada con:", call.peer);
    
    call.on("stream", async (remoteStream: MediaStream) => {
      console.log("📹 Stream remoto recibido de:", call.peer);
      logStreamInfo(remoteStream, "remoto recibido");
      
      if (remoteVideoRef.current) {
        // Clear any existing stream first
        if (remoteVideoRef.current.srcObject) {
          const oldStream = remoteVideoRef.current.srcObject as MediaStream;
          oldStream.getTracks().forEach(track => {
            console.log("🛑 Deteniendo track antiguo:", track.kind);
            track.stop();
          });
        }
        
        console.log("🔗 Asignando stream remoto al elemento video");
        remoteVideoRef.current.srcObject = remoteStream;
        
        // Force video attributes
        remoteVideoRef.current.muted = false;
        remoteVideoRef.current.volume = 1.0;
        
        // Wait for metadata to load
        await new Promise((resolve) => {
          remoteVideoRef.current!.onloadedmetadata = () => {
            console.log("✅ Metadata del video remoto cargada");
            console.log("   - Video dimensions:", remoteVideoRef.current!.videoWidth, "x", remoteVideoRef.current!.videoHeight);
            resolve(true);
          };
          
          // Timeout de seguridad
          setTimeout(() => {
            console.log("⏰ Timeout esperando metadata, intentando reproducir de todos modos");
            resolve(false);
          }, 2000);
        });
        
        try {
          console.log("▶️ Intentando reproducir video remoto...");
          await remoteVideoRef.current.play();
          console.log("✅ Video remoto reproduciéndose correctamente");
        } catch (err: any) {
          console.error("❌ Error reproduciendo video remoto:", err.name, err.message);
          
          // Try with user interaction
          const playWithInteraction = () => {
            console.log("🖱️ Intentando reproducir con interacción del usuario");
            remoteVideoRef.current?.play()
              .then(() => {
                console.log("✅ Video remoto reproduciéndose después de interacción");
                document.removeEventListener('click', playWithInteraction);
              })
              .catch(retryErr => console.error("❌ Error en retry:", retryErr));
          };
          
          // Add click listener to retry play on user interaction
          document.addEventListener('click', playWithInteraction, { once: true });
          console.log("👆 Esperando click del usuario para reproducir video");
        }
      } else {
        console.error("❌ remoteVideoRef.current es null!");
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
      myPeerIdRef.current = id;
      signalingSocket.emit("registerPeerId", id);
    });

    peer.on("call", (call) => {
      console.log("📞 Llamada entrante de:", call.peer);
      logStreamInfo(stream, "local para responder");
      
      // Answer with local stream
      call.answer(stream);
      console.log("✅ Llamada respondida con stream local");
      
      // Only set callRef if we don't have one already
      if (!callRef.current) {
        callRef.current = call;
        hasInitiatedCallRef.current = true;
        console.log("📝 CallRef establecido para llamada entrante");
      }
      
      // Setup handlers for this call
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
          <svg className="warning-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          La sala está llena. Solo se permiten 2 usuarios.
        </div>
      )}

      {!isCallActive && !roomFull && (
        <div className="video-info">
          <svg className="info-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <strong>Nota:</strong> Al iniciar la llamada, tu navegador pedirá permiso para acceder a la cámara y micrófono.
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
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              )}
            </button>

            <button onClick={endCall} className="btn-end-call">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
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
