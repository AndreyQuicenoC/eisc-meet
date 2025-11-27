import { io, Socket } from "socket.io-client";

/**
 * WebRTC Signaling Socket Configuration
 * 
 * Connects to: https://eisc-video-3ee1ac20d78b.herokuapp.com
 * 
 * ✅ FIXED URL - No dynamic logic
 * ✅ Polling + WebSocket for Heroku compatibility
 * ✅ Auto-reconnection enabled
 */

export const signalingSocket: Socket = io("https://eisc-video-3ee1ac20d78b.herokuapp.com", {
  autoConnect: false,
  transports: ["polling", "websocket"],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});

console.log('📡 WebRTC Signaling Socket initialized for: https://eisc-video-3ee1ac20d78b.herokuapp.com');

