const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const gameLogic = require('./gameLogic');
const { registerSocketHandlers } = require('./socketHandlers');

const PORT = process.env.PORT || 4000;
// En dev "séparé" (client Vite sur un autre port), il faut du CORS. Mais le
// serveur sert aussi désormais le client buildé (voir plus bas) : dans ce
// cas tout passe par la même origine et le CORS ne sert plus à rien, mais on
// le laisse en place (inoffensif) pour ne pas casser le workflow `npm run
// dev` classique. Restreignable via la variable d'env CLIENT_ORIGIN.
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Sert le client React buildé (client/dist, généré par `npm run build` dans
// client/) directement depuis ce serveur. Ça permet de tout faire tourner
// sur un seul port (celui-ci) : plus besoin du serveur de dev Vite séparé
// pour jouer, et un seul port à exposer (ex. via un tunnel Cloudflare) pour
// que des amis distants rejoignent la partie.
const clientDistPath = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDistPath));

// Tout le reste (routes React côté client, s'il y en avait) renvoie
// index.html — classique pour une SPA. Comme socket.io intercepte déjà ses
// propres requêtes (/socket.io/...) avant qu'elles n'atteignent Express, ce
// catch-all ne peut pas lui faire concurrence.
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) {
      res
        .status(500)
        .send(
          "Le build du client est introuvable (client/dist). Lancez `npm run build` dans le dossier client, puis relancez ce serveur."
        );
    }
  });
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
