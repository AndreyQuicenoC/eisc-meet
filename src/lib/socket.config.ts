import { io } from "socket.io-client";

/**
 * Chat Socket Configuration
 * 
 * Connects to: https://eisc-chat.onrender.com
 * 
 * ✅ FIXED URL - No dynamic logic
 * ✅ WebSocket transport preferred
 * ✅ Auto-reconnection enabled
 */

export const socket = io("https://eisc-chat.onrender.com", {
  autoConnect: false,
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});

console.log('💬 Chat Socket initialized for: https://eisc-chat.onrender.com');
