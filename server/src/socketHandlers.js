// Couche "plomberie" Socket.io : traduit les événements réseau en appels à
// gameLogic.js, puis diffuse le nouvel état à tous les clients connectés.
//
// Depuis l'ajout des cartes développement, chaque joueur doit voir le détail
// de SA propre main (ressources + cartes dev) mais seulement le nombre total
// de cartes des autres joueurs : on ne peut donc plus faire un simple
// io.emit() unique, il faut émettre une vue personnalisée par socket.
//
// Choix MVP : une seule partie globale (pas de système de "rooms" /
// plusieurs tables). Pour un petit groupe d'amis qui joue ensemble, c'est
// suffisant et ça simplifie beaucoup la synchronisation d'état.

const gameLogic = require('./gameLogic');

function registerSocketHandlers(io, state) {
  function broadcastState() {
    io.sockets.sockets.forEach((clientSocket) => {
      clientSocket.emit('game_state', gameLogic.getPublicStateFor(state, clientSocket.id));
    });
  }

  io.on('connection', (socket) => {
    console.log(`[socket] connexion: ${socket.id}`);

    // On envoie immédiatement l'état courant au nouveau client, même s'il
    // n'a pas encore rejoint la partie (utile pour afficher le lobby).
    socket.emit('game_state', gameLogic.getPublicStateFor(state, socket.id));

    socket.on('join_game', (payload) => {
      const name = payload && typeof payload.name === 'string' ? payload.name : '';
      const result = gameLogic.addPlayer(state, socket.id, name);
      if (!result.ok) {
        socket.emit('error_message', result.error);
        return;
      }
      broadcastState();
    });

    socket.on('start_game', () => {
      const result = gameLogic.startGame(state);
      if (!result.ok) {
        socket.emit('error_message', result.error);
        return;
      }
      broadcastState();
    });

    socket.on('setup_place_settlement', (payload) => {
      const vertexId = payload && payload.vertexId;
      const result = gameLogic.setupPlaceSettlement(state, socket.id, vertexId);
      if (!result.ok) {
        socket.emit('error_message', result.error);
        return;
      }
      broadcastState();
    });

    socket.on('setup_place_road', (payload) => {
      const edgeId = payload && payload.edgeId;
      const result = gameLogic.setupPlaceRoad(state, socket.id, edgeId);
      if (!result.ok) {
        socket.emit('error_message', result.error);
        return;
      }
      broadcastState();
    });

    socket.on('roll_dice', () => {
      const result = gameLogic.rollDice(state, socket.id);
      if (!result.ok) {
        socket.emit('error_message', result.error);
        return;
      }
      broadcastState();
    });

    socket.on('build_road', (payload) => {
      const edgeId = payload && payload.edgeId;
      const result = gameLogic.buildRoad(state, socket.id, edgeId);
      if (!result.ok) {
        socket.emit('error_message', result.error);
        return;
      }
      broadcastState();
    });

    socket.on('build_settlement', (payload) => {
      const vertexId = payload && payload.vertexId;
      const result = gameLogic.buildSettlement(state, socket.id, vertexId);
      if (!result.ok) {
        socket.emit('error_message', result.error);
        return;
      }
      broadcastState();
    });

    socket.on('build_city', (payload) => {
      const vertexId = payload && payload.vertexId;
      const result = gameLogic.buildCity(state, socket.id, vertexId);
      if (!result.ok) {
        socket.emit('error_message', result.error);
        return;
      }
      broadcastState();
    });

    socket.on('buy_dev_card', () => {
      const result = gameLogic.buyDevCard(state, socket.id);
      if (!result.ok) {
        socket.emit('error_message', result.error);
        return;
      }
      broadcastState();
    });

    socket.on('play_dev_card', (payload) => {
      const cardType = payload && payload.cardType;
      const result = gameLogic.playDevCard(state, socket.id, cardType, payload);
      if (!result.ok) {
        socket.emit('error_message', result.error);
        return;
      }
      broadcastState();
    });

    socket.on('build_free_road', (payload) => {
      const edgeId = payload && payload.edgeId;
      const result = gameLogic.buildFreeRoad(state, socket.id, edgeId);
      if (!result.ok) {
        socket.emit('error_message', result.error);
        return;
      }
      broadcastState();
    });

    socket.on('propose_trade', (payload) => {
      const offering = payload && payload.offering;
      const requesting = payload && payload.requesting;
      const result = gameLogic.proposeTrade(state, socket.id, offering, requesting);
      if (!result.ok) {
        socket.emit('error_message', result.error);
        return;
      }
      broadcastState();
    });

    socket.on('cancel_trade', () => {
      const result = gameLogic.cancelTrade(state, socket.id);
      if (!result.ok) {
        socket.emit('error_message', result.error);
        return;
      }
      broadcastState();
    });

    socket.on('accept_trade', (payload) => {
      const tradeId = payload && payload.tradeId;
      const result = gameLogic.acceptTrade(state, socket.id, tradeId);
      if (!result.ok) {
        socket.emit('error_message', result.error);
        return;
      }
      broadcastState();
    });

    socket.on('bank_trade', (payload) => {
      const give = payload && payload.give;
      const receive = payload && payload.receive;
      const result = gameLogic.bankTrade(state, socket.id, give, receive);
      if (!result.ok) {
        socket.emit('error_message', result.error);
        return;
      }
      broadcastState();
    });

    socket.on('end_turn', () => {
      const result = gameLogic.endTurn(state, socket.id);
      if (!result.ok) {
        socket.emit('error_message', result.error);
        return;
      }
      broadcastState();
    });

    socket.on('new_game', () => {
      const result = gameLogic.newGame(state);
      if (!result.ok) {
        socket.emit('error_message', result.error);
        return;
      }
      broadcastState();
    });

    socket.on('disconnect', () => {
      console.log(`[socket] déconnexion: ${socket.id}`);
      gameLogic.removePlayer(state, socket.id);
      broadcastState();
    });
  });
}

module.exports = { registerSocketHandlers };
