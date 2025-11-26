import { io, Socket } from "socket.io-client";
import { SIGNALING_URL } from "./env.config";

// Configuración del socket para WebRTC signaling
export const signalingSocket: Socket = io(SIGNALING_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});

// Configuración de ICE servers para WebRTC
export const iceServersConfig: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
};
