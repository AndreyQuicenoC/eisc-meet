/**
 * Backend Configuration - Fixed Production URLs
 * 
 * All connections point to Render.com backends:
 * - Chat Service: https://eisc-chat.onrender.com
 * - Video Signaling: https://eisc-video.onrender.com
 * 
 * For local development, update these URLs to localhost
 */

// ✅ FIXED PRODUCTION URLs for Render.com
export const CHAT_URL = 'https://eisc-chat.onrender.com';
export const SIGNALING_URL = 'https://eisc-video-3ee1ac20d78b.herokuapp.com';

// For backwards compatibility
export const SOCKET_URL = CHAT_URL;

// Log configuration
console.log('='.repeat(60));
console.log('🔧 Backend Configuration');
console.log('='.repeat(60));
console.log('📡 Chat Service:', CHAT_URL);
console.log('📡 Video Signaling:', SIGNALING_URL);
console.log('='.repeat(60));
