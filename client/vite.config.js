import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Config Vite minimale : le serveur Socket.io tourne sur un port séparé
// (voir client/src/socket.js pour l'URL du serveur).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  }
});
