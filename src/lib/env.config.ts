// Configuración dinámica de URLs basada en el entorno

// URLs de producción
const PROD_CHAT_URL = 'https://eisc-chat.onrender.com';
const PROD_SIGNALING_URL = 'https://eisc-video.onrender.com';

// Detectar si estamos en producción (Vercel)
const isProduction = window.location.hostname.includes('vercel.app');

function getBackendURL(): string {
  // Si estamos en producción, usar URL de producción
  if (isProduction) {
    return PROD_CHAT_URL;
  }
  
  // Si estamos en localhost, usar localhost
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }
  
  // Si estamos en una IP de red local, usar esa misma IP
  return `http://${window.location.hostname}:3000`;
}

function getSignalingURL(): string {
  // Si estamos en producción, usar URL de producción
  if (isProduction) {
    return PROD_SIGNALING_URL;
  }
  
  // Si estamos en localhost, usar localhost
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3001';
  }
  
  // Si estamos en una IP de red local, usar esa misma IP
  return `http://${window.location.hostname}:3001`;
}

export const SOCKET_URL = getBackendURL();
export const SIGNALING_URL = getSignalingURL();

// Log para debugging
console.log('Entorno:', isProduction ? 'Producción' : 'Desarrollo');
console.log('Chat URL:', SOCKET_URL);
console.log('Signaling URL:', SIGNALING_URL);
