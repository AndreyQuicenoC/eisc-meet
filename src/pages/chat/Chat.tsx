import type React from 'react';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../../lib/socket.config';
import useAuthStore from '../../stores/useAuthStore';
import './Chat.scss';

interface Message {
    id: string;
    user: string;
    message: string;
    timestamp: number;
}

const Chat: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [messages, setMessages] = useState<Message[]>([]);
    const [messageInput, setMessageInput] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Verificar autenticación
        if (!user) {
            navigate('/login');
            return;
        }

        // Conectar al socket
        socket.connect();

        // Event listeners
        socket.on('connect', () => {
            setIsConnected(true);
            console.log('Conectado al servidor de chat');
        });

        socket.on('disconnect', () => {
            setIsConnected(false);
            console.log('Desconectado del servidor de chat');
        });

        socket.on('message', (data: Message) => {
            setMessages(prev => [...prev, data]);
        });

        socket.on('previous-messages', (data: Message[]) => {
            setMessages(data);
        });

        // Cleanup
        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('message');
            socket.off('previous-messages');
            socket.disconnect();
        };
    }, [user, navigate]);

    useEffect(() => {
        // Scroll to bottom when new messages arrive
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!messageInput.trim() || !user) return;

        const message: Message = {
            id: Date.now().toString(),
            user: user.displayName || user.email || 'Usuario',
            message: messageInput,
            timestamp: Date.now(),
        };

        socket.emit('message', message);
        setMessageInput('');
    };

    const handleLogout = () => {
        socket.disconnect();
        navigate('/login');
    };

    return (
        <div className="chat-page">
            {/* Header */}
            <header className="header">
                <div className="header-container">
                    <div className="logo">
                        <h1>CHARLATON</h1>
                    </div>
                    <nav>
                        <a href="#">Inicio</a>
                        <a href="#">Producto</a>
                        <a href="#">Sobre nosotros</a>
                    </nav>
                    <div className="user-actions">
                        <span className="user-name">
                            {user?.displayName || user?.email}
                        </span>
                        <button onClick={handleLogout}>
                            Cerrar sesión
                        </button>
                    </div>
                </div>
            </header>

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
                                {messages.length} mensajes
                            </div>
                        </div>
                    </div>

                    {/* Messages Container */}
                    <div className="messages-container">
                        {messages.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-content">
                                    <svg fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
                                    </svg>
                                    <p className="empty-title">No hay mensajes aún</p>
                                    <p className="empty-subtitle">¡Sé el primero en enviar un mensaje!</p>
                                </div>
                            </div>
                        ) : (
                            messages.map((msg) => (
                                <div 
                                    key={msg.id}
                                    className={`message ${msg.user === (user?.displayName || user?.email) ? 'sent' : 'received'}`}
                                >
                                    <div className={`message-bubble ${msg.user === (user?.displayName || user?.email) ? 'sent-bubble' : 'received-bubble'}`}>
                                        <p className="message-author">
                                            {msg.user === (user?.displayName || user?.email) ? 'Tú' : msg.user}
                                        </p>
                                        <p className="message-text">{msg.message}</p>
                                        <p className={`message-time ${msg.user === (user?.displayName || user?.email) ? 'sent-time' : 'received-time'}`}>
                                            {new Date(msg.timestamp).toLocaleTimeString('es-ES', {
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Message Input */}
                    <form 
                        onSubmit={handleSendMessage}
                        className="message-input-form"
                    >
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
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            </button>
                        </div>
                    </form>
                </div>
            </main>

            {/* Footer */}
            <footer className="footer">
                <div className="footer-container">
                    <div className="footer-grid">
                        {/* Navegación */}
                        <div className="footer-column">
                            <h3>Navegación</h3>
                            <ul>
                                <li><a href="#">Inicio</a></li>
                                <li><a href="#">Producto</a></li>
                                <li><a href="#">Sobre nosotros</a></li>
                            </ul>
                        </div>

                        {/* Cuenta */}
                        <div className="footer-column">
                            <h3>Cuenta</h3>
                            <ul>
                                <li><a href="/login">Iniciar sesión</a></li>
                                <li><a href="#">Registrarte</a></li>
                                <li><a href="#">Recuperar Contraseña</a></li>
                            </ul>
                        </div>

                        {/* Ayuda */}
                        <div className="footer-column">
                            <h3>Ayuda</h3>
                            <ul>
                                <li><a href="#">Contáctanos</a></li>
                                <li><a href="#">Preguntas Frecuentes</a></li>
                                <li><a href="#">Manual de Usuario</a></li>
                                <li><a href="#">Test de Velocidad</a></li>
                            </ul>
                        </div>

                        {/* Legal */}
                        <div className="footer-column">
                            <h3>Legal</h3>
                            <ul>
                                <li><a href="#">Privacidad</a></li>
                                <li><a href="#">Términos de Uso</a></li>
                                <li><a href="#">Cookies</a></li>
                                <li><a href="#">Accesibilidad</a></li>
                            </ul>
                        </div>
                    </div>

                    {/* Copyright */}
                    <div className="footer-bottom">
                        <p>@2025 Charlaton Company, LLC. Todos los derechos reservados. Maraton es de uso libre</p>
                        
                        {/* Social Icons */}
                        <div className="social-icons">
                            <a href="#">
                                <svg fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
                                </svg>
                            </a>
                            <a href="#">
                                <svg fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                </svg>
                            </a>
                            <a href="#">
                                <svg fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                                </svg>
                            </a>
                            <a href="#">
                                <svg fill="currentColor" viewBox="0 0 24 24">
                                    <circle cx="12" cy="12" r="10"/>
                                    <path fill="white" d="M8 14.5c.5 2 2.5 3.5 4 3.5s3.5-1.5 4-3.5"/>
                                    <circle fill="white" cx="9" cy="9" r="1"/>
                                    <circle fill="white" cx="15" cy="9" r="1"/>
                                </svg>
                            </a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Chat;
