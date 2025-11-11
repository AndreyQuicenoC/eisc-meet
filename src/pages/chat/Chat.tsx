import type React from "react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "../../lib/socket.config";
import useAuthStore from "../../stores/useAuthStore";
import Navbar from "../../components/Navbar/Navbar";
import Footer from "../../components/Footer/Footer";
import "./Chat.scss";

interface Message {
  id?: string;
  senderId: string;
  text: string;
  timestamp: number;
}

interface OnlineUser {
  socketId: string;
  userId: string;
}

const Chat: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasLoadedHistory = useRef(false);

  useEffect(() => {
    // Verificar autenticación
    if (!user) {
      navigate("/login");
      return;
    }

    // Conectar al socket
    socket.connect();

    // Event listeners
    socket.on("connect", () => {
      setIsConnected(true);
      console.log("✅ Conectado al servidor de chat");
      
      // Registrar usuario en el servidor
      if (user?.email) {
        socket.emit("newUser", user.email);
        console.log("👤 Usuario registrado:", user.email);
      }
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      console.log("❌ Desconectado del servidor de chat");
    });

    // Escuchar nuevos mensajes
    socket.on("newMessage", (message: Message) => {
      console.log("📨 Nuevo mensaje recibido:", message);
      setMessages((prev) => [...prev, message]);
    });

    // Escuchar usuarios online
    socket.on("usersOnline", (users: OnlineUser[]) => {
      console.log("👥 Usuarios online:", users.length);
      setOnlineUsers(users);
    });

    // Cleanup
    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("newMessage");
      socket.off("usersOnline");
      socket.disconnect();
    };
  }, [user, navigate]);

  // Cargar historial de mensajes una sola vez
  useEffect(() => {
    if (user && isConnected && !hasLoadedHistory.current) {
      loadChatHistory();
      hasLoadedHistory.current = true;
    }
  }, [user, isConnected]);

  // Cargar historial de mensajes desde el API
  const loadChatHistory = async () => {
    try {
      const API_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";
      console.log("📥 Cargando historial de mensajes...");
      
      const response = await fetch(`${API_URL}/api/messages?limit=100`);
      const data = await response.json();
      
      if (data.success && data.messages) {
        setMessages(data.messages);
        console.log("✅ Historial cargado:", data.messages.length, "mensajes");
      }
    } catch (error) {
      console.error("❌ Error cargando historial:", error);
    }
  };

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !user || !isConnected) return;

    console.log("📤 Enviando mensaje:", messageInput);
    
    // Enviar mensaje al servidor
    socket.emit("sendMessage", {
      senderId: user.email || user.displayName || "Usuario",
      text: messageInput.trim(),
    });

    setMessageInput("");
  };

  const handleLogout = () => {
    socket.disconnect();
    navigate("/login");
  };

  return (
    <div className="chat-page">
      {/* Header */}
      <Navbar onLogout={handleLogout} />

      {/* Main Content */}
      <main className="main-content">
        <div className="chat-container">
          {/* Chat Header */}
          <div className="chat-header">
            <div className="chat-header-content">
              <div className="chat-title">
                <h2>Chat Global</h2>
                <p className="status">
                  {isConnected ? (
                    <>
                      <span className="status-dot online"></span>
                      Conectado
                    </>
                  ) : (
                    <>
                      <span className="status-dot offline"></span>
                      Desconectado
                    </>
                  )}
                </p>
              </div>
              <div className="message-count">
                {onlineUsers.length} usuario{onlineUsers.length !== 1 ? 's' : ''} online | {messages.length} mensaje{messages.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {/* Messages Container */}
          <div className="messages-container">
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-content">
                  <svg fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
                  </svg>
                  <p className="empty-title">No hay mensajes aún</p>
                  <p className="empty-subtitle">
                    ¡Sé el primero en enviar un mensaje!
                  </p>
                </div>
              </div>
            ) : (
              messages.map((msg, index) => {
                const isOwnMessage = msg.senderId === user?.email || 
                                    msg.senderId === user?.displayName;
                
                return (
                  <div
                    key={msg.id || `${msg.timestamp}-${index}`}
                    className={`message ${isOwnMessage ? "sent" : "received"}`}
                  >
                    <div
                      className={`message-bubble ${
                        isOwnMessage ? "sent-bubble" : "received-bubble"
                      }`}
                    >
                      <p className="message-author">
                        {isOwnMessage ? "Tú" : msg.senderId}
                      </p>
                      <p className="message-text">{msg.text}</p>
                      <p
                        className={`message-time ${
                          isOwnMessage ? "sent-time" : "received-time"
                        }`}
                      >
                        {new Date(msg.timestamp).toLocaleTimeString("es-ES", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <form onSubmit={handleSendMessage} className="message-input-form">
            <div className="input-container">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Escribe un mensaje..."
                disabled={!isConnected}
              />
              <button
                type="submit"
                disabled={!isConnected || !messageInput.trim()}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Chat;
