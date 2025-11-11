import type React from 'react';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../../lib/socket.config';
import useAuthStore from '../../stores/useAuthStore';

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
        <>
            {/* Header */}
            <header className="w-full bg-white border-b border-gray-200 py-4 px-8 fixed top-0 z-50">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-500 to-cyan-600 bg-clip-text text-transparent m-0">
                            CHARLATON
                        </h1>
                    </div>
                    <nav className="flex gap-6 bg-transparent p-0 relative">
                        <a href="#" className="text-gray-600 hover:text-gray-900 no-underline text-base">Inicio</a>
                        <a href="#" className="text-gray-600 hover:text-gray-900 no-underline text-base">Producto</a>
                        <a href="#" className="text-gray-600 hover:text-gray-900 no-underline text-base">Sobre nosotros</a>
                    </nav>
                    <div className="flex gap-4 items-center">
                        <span className="text-gray-700 text-sm">
                            {user?.displayName || user?.email}
                        </span>
                        <button 
                            onClick={handleLogout}
                            className="bg-transparent text-cyan-500 border-2 border-cyan-500 hover:bg-cyan-50 px-6 py-2 w-auto"
                        >
                            Cerrar sesión
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Chat Container */}
            <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-cyan-100 to-blue-100 pt-20 pb-6 px-4">
                <div className="max-w-6xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
                    {/* Chat Header */}
                    <div className="bg-white rounded-t-2xl shadow-lg p-6 border-b border-gray-200">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-800 m-0">
                                    Chat Global
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    {isConnected ? (
                                        <span className="flex items-center gap-2">
                                            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                            Conectado
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-2">
                                            <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                                            Desconectado
                                        </span>
                                    )}
                                </p>
                            </div>
                            <div className="text-sm text-gray-600">
                                {messages.length} mensajes
                            </div>
                        </div>
                    </div>

                    {/* Messages Container */}
                    <div className="flex-1 bg-white overflow-y-auto p-6 space-y-4">
                        {messages.length === 0 ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center text-gray-400">
                                    <svg className="w-16 h-16 mx-auto mb-4 text-cyan-200" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
                                    </svg>
                                    <p className="text-lg">No hay mensajes aún</p>
                                    <p className="text-sm">¡Sé el primero en enviar un mensaje!</p>
                                </div>
                            </div>
                        ) : (
                            messages.map((msg) => (
                                <div 
                                    key={msg.id}
                                    className={`flex ${msg.user === (user?.displayName || user?.email) ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div 
                                        className={`max-w-md px-4 py-3 rounded-2xl shadow-sm ${
                                            msg.user === (user?.displayName || user?.email)
                                                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                                                : 'bg-gray-100 text-gray-800'
                                        }`}
                                    >
                                        <p className="font-semibold text-sm mb-1">
                                            {msg.user === (user?.displayName || user?.email) ? 'Tú' : msg.user}
                                        </p>
                                        <p className="text-sm break-words">{msg.message}</p>
                                        <p className={`text-xs mt-1 ${
                                            msg.user === (user?.displayName || user?.email)
                                                ? 'text-cyan-100'
                                                : 'text-gray-500'
                                        }`}>
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
                        className="bg-white rounded-b-2xl shadow-lg p-4 border-t border-gray-200"
                    >
                        <div className="flex gap-3">
                            <input
                                type="text"
                                value={messageInput}
                                onChange={(e) => setMessageInput(e.target.value)}
                                placeholder="Escribe un mensaje..."
                                className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-cyan-500 transition-colors"
                                disabled={!isConnected}
                            />
                            <button
                                type="submit"
                                disabled={!isConnected || !messageInput.trim()}
                                className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-8 py-3 rounded-xl font-medium hover:from-cyan-600 hover:to-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Footer */}
            <footer className="bg-gray-900 text-white py-12 px-8">
                <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
                    {/* Navegación */}
                    <div>
                        <h3 className="font-bold text-lg mb-4">Navegación</h3>
                        <ul className="space-y-2">
                            <li><a href="#" className="text-gray-400 hover:text-white text-sm no-underline">Inicio</a></li>
                            <li><a href="#" className="text-gray-400 hover:text-white text-sm no-underline">Producto</a></li>
                            <li><a href="#" className="text-gray-400 hover:text-white text-sm no-underline">Sobre nosotros</a></li>
                        </ul>
                    </div>

                    {/* Cuenta */}
                    <div>
                        <h3 className="font-bold text-lg mb-4">Cuenta</h3>
                        <ul className="space-y-2">
                            <li><a href="/login" className="text-gray-400 hover:text-white text-sm no-underline">Iniciar sesión</a></li>
                            <li><a href="#" className="text-gray-400 hover:text-white text-sm no-underline">Registrarte</a></li>
                            <li><a href="#" className="text-gray-400 hover:text-white text-sm no-underline">Recuperar Contraseña</a></li>
                        </ul>
                    </div>

                    {/* Ayuda */}
                    <div>
                        <h3 className="font-bold text-lg mb-4">Ayuda</h3>
                        <ul className="space-y-2">
                            <li><a href="#" className="text-gray-400 hover:text-white text-sm no-underline">Contáctanos</a></li>
                            <li><a href="#" className="text-gray-400 hover:text-white text-sm no-underline">Preguntas Frecuentes</a></li>
                            <li><a href="#" className="text-gray-400 hover:text-white text-sm no-underline">Manual de Usuario</a></li>
                            <li><a href="#" className="text-gray-400 hover:text-white text-sm no-underline">Test de Velocidad</a></li>
                        </ul>
                    </div>

                    {/* Legal */}
                    <div>
                        <h3 className="font-bold text-lg mb-4">Legal</h3>
                        <ul className="space-y-2">
                            <li><a href="#" className="text-gray-400 hover:text-white text-sm no-underline">Privacidad</a></li>
                            <li><a href="#" className="text-gray-400 hover:text-white text-sm no-underline">Términos de Uso</a></li>
                            <li><a href="#" className="text-gray-400 hover:text-white text-sm no-underline">Cookies</a></li>
                            <li><a href="#" className="text-gray-400 hover:text-white text-sm no-underline">Accesibilidad</a></li>
                        </ul>
                    </div>
                </div>

                {/* Copyright */}
                <div className="max-w-7xl mx-auto mt-8 pt-8 border-t border-gray-700 text-center text-gray-400 text-sm">
                    <p>@2025 Charlaton Company, LLC. Todos los derechos reservados. Maraton es de uso libre</p>
                    
                    {/* Social Icons */}
                    <div className="flex justify-center gap-6 mt-6">
                        <a href="#" className="text-gray-400 hover:text-white">
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
                            </svg>
                        </a>
                        <a href="#" className="text-gray-400 hover:text-white">
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                            </svg>
                        </a>
                        <a href="#" className="text-gray-400 hover:text-white">
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                            </svg>
                        </a>
                        <a href="#" className="text-gray-400 hover:text-white">
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10"/>
                                <path fill="white" d="M8 14.5c.5 2 2.5 3.5 4 3.5s3.5-1.5 4-3.5"/>
                                <circle fill="white" cx="9" cy="9" r="1"/>
                                <circle fill="white" cx="15" cy="9" r="1"/>
                            </svg>
                        </a>
                    </div>
                </div>
            </footer>
        </>
    );
};

export default Chat;
