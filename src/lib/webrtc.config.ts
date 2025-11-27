import { io, Socket } from "socket.io-client";

/**
 * WebRTC Signaling Socket Configuration
 * 
 * Connects to: https://eisc-video-production.up.railway.app
 * 
 * ✅ FIXED URL - No dynamic logic
 * ✅ WebSocket transport preferred
 * ✅ Auto-reconnection enabled
 */

export const signalingSocket: Socket = io("https://eisc-video-production.up.railway.app", {
  autoConnect: false,
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});

console.log('📡 WebRTC Signaling Socket initialized for: https://eisc-video-production.up.railway.app');

