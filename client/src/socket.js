import { io } from 'socket.io-client';

// URL du serveur Socket.io. Par défaut, on se connecte à la même origine
// que celle qui a servi cette page (window.location.origin) : ça fonctionne
// automatiquement que la page soit ouverte via http://localhost:4000, via
// l'IP locale du serveur sur le réseau, ou via une URL de tunnel (Cloudflare
// Tunnel, ngrok...) — sans rien à configurer par ami connecté, puisque le
// serveur Express sert désormais aussi le client buildé sur ce même port.
// Personnalisable via la variable d'env Vite VITE_SERVER_URL, utile
// uniquement si le client tourne encore séparément via `npm run dev` (Vite
// sur le port 5173) pendant que le serveur Socket.io écoute sur un autre
// port (4000 par défaut).
const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;

export const socket = io(SERVER_URL, {
  autoConnect: true
});
