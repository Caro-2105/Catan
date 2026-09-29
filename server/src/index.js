const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const gameLogic = require('./gameLogic');
const { registerSocketHandlers } = require('./socketHandlers');

const PORT = process.env.PORT || 4000;
// En dev, le client (Vite) tourne sur un port différent : on autorise donc
// le CORS pour Socket.io et pour l'API HTTP. En prod, restreindre à l'URL
// réelle du client via la variable d'env CLIENT_ORIGIN.
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN }
});

// État global unique de la partie (pas de base de données pour ce MVP :
// tout vit en mémoire tant que le process tourne).
const state = gameLogic.createInitialState();

registerSocketHandlers(io, state);

httpServer.listen(PORT, () => {
  console.log(`Serveur Catan MVP à l'écoute sur http://localhost:${PORT}`);
});
