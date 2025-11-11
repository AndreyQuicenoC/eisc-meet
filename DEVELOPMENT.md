# CHARLATON - Chat Application

## 🎨 Diseño

El proyecto sigue el diseño de CHARLATON con:

- **Header**: Logo CHARLATON, navegación (Inicio, Producto, Sobre nosotros), y botones de sesión
- **Footer**: Mapa del sitio completo con secciones de Navegación, Cuenta, Ayuda y Legal
- **Colores**: Esquema de colores cyan/azul para mantener coherencia visual
- **Estilo**: Diseño moderno, limpio y profesional con gradientes y sombras suaves

## 📁 Estructura del Proyecto

```
src/
├── pages/
│   ├── login/
│   │   └── Login.tsx          # Página de login con Google Auth
│   ├── profile/
│   │   └── Profile.tsx        # Página de perfil del usuario
│   └── chat/
│       └── Chat.tsx           # Chat global con websockets
├── lib/
│   ├── firebase.config.ts     # Configuración de Firebase
│   └── socket.config.ts       # Configuración de Socket.IO
├── stores/
│   └── useAuthStore.ts        # Estado global de autenticación
├── daos/
│   └── UserDao.ts             # Data Access Object para usuarios
└── routes/
    └── router.tsx             # Configuración de rutas
```

## 🚀 Ramas

### `develop-auth`

Contiene el diseño del login siguiendo el estilo de CHARLATON:

- ✅ Login con Google OAuth
- ✅ Header con navegación
- ✅ Footer completo con mapa del sitio
- ✅ Integración con Firebase Authentication
- ✅ Diseño responsive y moderno

### `develop-websockets`

Contiene la implementación del chat global:

- ✅ Chat en tiempo real con Socket.IO
- ✅ Interfaz de chat moderna y cómoda
- ✅ Protección de ruta (solo usuarios autenticados)
- ✅ Muestra el nombre del usuario en los mensajes
- ✅ Diseño coherente con el estilo del login
- ✅ Indicador de conexión
- ✅ Scroll automático a nuevos mensajes

## 🔧 Configuración

### Variables de Entorno (.env)

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
VITE_SOCKET_URL=http://localhost:3000
```

## 📦 Dependencias

- **React 19** - Framework UI
- **React Router DOM** - Routing
- **Firebase** - Autenticación
- **Socket.IO Client** - WebSockets para chat en tiempo real
- **Zustand** - Estado global
- **Tailwind CSS v4** - Estilos

## 🎯 Funcionalidades

### Login

- Autenticación con Google
- Redirección automática al perfil
- Diseño fiel a las imágenes de referencia
- Footer con mapa del sitio completo

### Chat Global

- Conexión en tiempo real vía WebSockets
- Interfaz intuitiva y moderna
- Mensajes con timestamp
- Distinción visual entre mensajes propios y de otros usuarios
- Scroll automático a nuevos mensajes
- Indicador de estado de conexión
- Protección de acceso (solo usuarios autenticados)

## 🔒 Seguridad

- Rutas protegidas con verificación de autenticación
- Solo usuarios autenticados pueden acceder al chat
- Configuración de Firebase en variables de entorno

## 🎨 Estilo Visual

- **Login**: Fondo degradado cyan, card blanco con sombras, botón de Google estilizado
- **Chat**: Interfaz limpia con mensajes en burbujas, gradientes cyan/azul
- **Coherencia**: Mismo header y footer en todas las páginas
- **Responsive**: Diseño adaptable a diferentes tamaños de pantalla

## 🚦 Próximos Pasos

Para que el chat funcione completamente, necesitas:

1. Configurar un servidor Socket.IO en `http://localhost:3000`
2. El servidor debe escuchar eventos:
   - `message` - Para recibir mensajes nuevos
   - `previous-messages` - Para enviar historial de mensajes
3. El servidor debe emitir:
   - `message` - Para broadcast de mensajes a todos los clientes

## 💻 Desarrollo

```bash
# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev

# Build para producción
npm run build
```

## 📝 Commits Realizados

### Rama develop-auth

1. "Add firebase config and UserDAO"
2. "Update login page design with CHARLATON style and Google auth integration"

### Rama develop-websockets

1. "Add socket.io-client dependency and socket URL config"
2. "Add socket.io client configuration"
3. "Add global chat component with websockets integration"
4. "Update routes and profile to include chat navigation"

---

Desarrollado siguiendo las especificaciones del diseño CHARLATON
