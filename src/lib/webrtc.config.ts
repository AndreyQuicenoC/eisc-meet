import { io, Socket } from "socket.io-client";

/**
 * WebRTC Signaling Socket Configuration
 * 
 * Connects to: https://eisc-video-3ee1ac20d78b.herokuapp.com
 * 
 * FIX HEROKU: Polling-first transport for Heroku router compatibility
 * FIX HEROKU: withCredentials for cross-origin cookies
 */

export const signalingSocket: Socket = io("https://eisc-video-3ee1ac20d78b.herokuapp.com", {
  autoConnect: false,
  
  // FIX HEROKU: Polling MUST be first for Heroku handshake
  transports: ["polling", "websocket"],
  
  // FIX HEROKU: Enable credentials for Heroku cookies
  withCredentials: true,
  
  // FIX HEROKU: Auto-reconnect with backoff
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 10,
  
  // FIX HEROKU: Upgrade timeout for slow Heroku connections
  timeout: 20000,
  
  // FIX HEROKU: Force new connection to avoid session conflicts
  forceNew: false,
  
  // FIX HEROKU: Allow EIO3 for Heroku compatibility
  upgrade: true
});

console.log('📡 WebRTC Signaling Socket initialized for: https://eisc-video-3ee1ac20d78b.herokuapp.com');

