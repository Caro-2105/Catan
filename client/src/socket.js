import { io } from 'socket.io-client';

// URL du serveur Socket.io. En dev, le serveur tourne sur le port 4000
// pendant que Vite sert le client sur le port 5173.
// Personnalisable via une variable d'env Vite (VITE_SERVER_URL) si besoin
// de pointer vers un serveur distant.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

export const socket = io(SERVER_URL, {
  autoConnect: true
});
