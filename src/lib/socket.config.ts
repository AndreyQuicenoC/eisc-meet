import { io } from "socket.io-client";
import { SOCKET_URL } from "./env.config";

// Configuración del socket para desarrollo y producción
export const socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});
