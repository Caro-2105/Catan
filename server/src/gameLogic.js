// Logique de jeu pure (sans dépendance à Socket.io) : état, validations,
// transitions. Tout est regroupé ici pour que socketHandlers.js reste une
// simple couche de "plomberie" réseau autour de ces fonctions.

const { generateBoard, getAdjacentVertexIds, getEdgesForVertex } = require('./board');
const {
  RESOURCE_TYPES,
  BUILD_COSTS,
  VICTORY_POINTS,
  DEV_CARD_COST,
  DEV_CARD_COUNTS,
  BANK_TRADE_RATE,
  PLAYER_COLORS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  LONGEST_ROAD_MIN_LENGTH,
  WINNING_SCORE
} = require('./constants');

const PLAYABLE_DEV_CARD_TYPES = ['route', 'invention', 'monopole'];

function emptyResources() {
  const resources = {};
  RESOURCE_TYPES.forEach((r) => (resources[r] = 0));
  return resources;
}

function createPlayer(id, name, color) {
  return {
    id,
    name,
    color,
    resources: emptyResources(),
    settlements: [], // [vertexId]
    cities: [], // [vertexId] — sous-ensemble de settlements qui a été amélioré en ville
    roads: [], // [edgeId]
    devCards: [] // [{ type, boughtOnTurn }]
  };
}

function createInitialState() {
  return {
    status: 'lobby', // 'lobby' | 'setup' | 'playing' | 'finished'
    winnerId: null, // socketId du gagnant une fois status === 'finished'
    board: null,
    players: {}, // socketId -> player
    playerOrder: [], // [socketId, ...] — ordre de tour de la partie réelle

    // Phase de mise en place interactive (placement des 2 colonies + 2
    // routes de départ, une paire à la fois, dans l'ordre "en serpent"
    // classique de Catan : J1,J2,J3,J3,J2,J1).
    setupOrder: [], // [socketId, ...] un élément par placement colonie+route
    setupIndex: 0,
    setupStep: null, // 'settlement' | 'road' | null
    setupLastVertexId: null, // sommet qui vient d'être posé, pour valider la route qui doit s'y connecter

    currentPlayerIndex: 0,
    turnNumber: 0, // incrémenté à chaque fin de tour, sert à savoir si une carte dev vient d'être achetée ce tour-ci
    phase: 'roll', // 'roll' | 'build'
    lastDiceRoll: null,
    log: [],

    devCardDeck: [], // pioche mélangée, un élément retiré à chaque achat
    devCardPlayedThisTurn: false, // une seule carte (hors Point de Victoire) jouable par tour
    freeRoadsRemaining: 0, // routes gratuites restantes suite à une carte "Route"

    pendingTrade: null, // { id, fromPlayerId, offering: {...}, requesting: {...} } | null
    tradeSeq: 0,

    longestRoadHolder: null, // socketId | null
    roadLengths: {} // socketId -> longueur de la plus longue route
  };
}

function pushLog(state, message) {
  state.log.push({ message, ts: Date.now() });
  if (state.log.length > 100) {
    state.log.shift();
  }
}

function currentPlayerId(state) {
  if (state.status === 'setup') {
    return state.setupOrder[state.setupIndex] || null;
  }
  return state.playerOrder[state.currentPlayerIndex] || null;
}

// ---- Gestion des joueurs / lobby -------------------------------------------------

function addPlayer(state, socketId, name) {
  if (state.status !== 'lobby') {
    return { ok: false, error: "La partie a déjà commencé, impossible de rejoindre." };
  }
  if (state.playerOrder.length >= MAX_PLAYERS) {
    return { ok: false, error: 'La partie est complète (4 joueurs maximum).' };
  }
  const cleanName = (name || '').trim().slice(0, 20) || `Joueur ${state.playerOrder.length + 1}`;
  const color = PLAYER_COLORS[state.playerOrder.length];

  state.players[socketId] = createPlayer(socketId, cleanName, color);
  state.playerOrder.push(socketId);
  pushLog(state, `${cleanName} a rejoint la partie.`);
  return { ok: true };
}

function removePlayer(state, socketId) {
  if (!state.players[socketId]) return;
  const name = state.players[socketId].name;
  delete state.players[socketId];
  const removedIndex = state.playerOrder.indexOf(socketId);
  state.playerOrder = state.playerOrder.filter((id) => id !== socketId);

  if (state.status === 'setup') {
    // La mise en place interactive (ordre en serpent, colonies déjà posées
    // par d'autres, etc.) devient difficile à corriger proprement si un
    // joueur part en cours de route. Simplification MVP : on repart d'un
    // salon d'attente propre avec les joueurs restants plutôt que de tenter
    // de raccommoder l'état en place.
    const remainingPlayers = state.playerOrder.map((id) => ({ id, name: state.players[id].name }));
    Object.assign(state, createInitialState());
    remainingPlayers.forEach((p, idx) => {
      state.players[p.id] = createPlayer(p.id, p.name, PLAYER_COLORS[idx]);
      state.playerOrder.push(p.id);
    });
    pushLog(state, `${name} a quitté la partie pendant la mise en place : retour au salon d'attente.`);
    return;
  }

  if (state.status === 'playing') {
    if (state.pendingTrade && state.pendingTrade.fromPlayerId === socketId) {
      state.pendingTrade = null;
    }
    if (state.playerOrder.length === 0) {
      // Plus personne : on repart de zéro.
      Object.assign(state, createInitialState());
      return;
    }
    if (removedIndex !== -1 && removedIndex < state.currentPlayerIndex) {
      state.currentPlayerIndex -= 1;
    }
    state.currentPlayerIndex = state.currentPlayerIndex % state.playerOrder.length;
    updateLongestRoad(state);
  }
  pushLog(state, `${name} a quitté la partie.`);
}

function shuffleArray(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function isEdgeOccupied(state, edgeId) {
  return state.playerOrder.some((playerId) => state.players[playerId].roads.includes(edgeId));
}

function isVertexOccupied(state, vertexId) {
  return state.playerOrder.some((playerId) => state.players[playerId].settlements.includes(vertexId));
}

function buildDevCardDeck() {
  const deck = [];
  Object.entries(DEV_CARD_COUNTS).forEach(([type, count]) => {
    for (let i = 0; i < count; i++) deck.push(type);
  });
  return shuffleArray(deck);
}

// ---- Démarrage de partie : lance la phase de mise en place interactive -----------

function startGame(state) {
  if (state.status !== 'lobby') {
    return { ok: false, error: 'La partie a déjà démarré.' };
  }
  if (state.playerOrder.length < MIN_PLAYERS) {
    return { ok: false, error: `Il faut au moins ${MIN_PLAYERS} joueurs pour démarrer.` };
  }

  state.board = generateBoard();
  state.devCardDeck = buildDevCardDeck();
  // Ordre de tour = ordre d'arrivée, mélangé pour ne pas toujours avantager
  // le premier connecté.
  state.playerOrder = shuffleArray(state.playerOrder);

  // Ordre "en serpent" pour la mise en place : chaque joueur place une 1ère
  // colonie+route dans l'ordre normal, puis une 2ème colonie+route dans
  // l'ordre inverse (règle standard Catan, pour compenser l'avantage du
  // premier joueur).
  state.setupOrder = [...state.playerOrder, ...[...state.playerOrder].reverse()];
  state.setupIndex = 0;
  state.setupStep = 'settlement';
  state.setupLastVertexId = null;
  state.status = 'setup';

  pushLog(state, 'La partie commence ! Chaque joueur va placer 2 colonies et 2 routes.');
  pushLog(state, `${state.players[currentPlayerId(state)].name} : choisissez l'emplacement de votre 1ère colonie.`);
  return { ok: true };
}

// ---- Phase de mise en place interactive -------------------------------------------

function assertSetupTurn(state, socketId) {
  if (state.status !== 'setup') return "La phase de mise en place n'est pas (ou plus) active.";
  if (currentPlayerId(state) !== socketId) return "Ce n'est pas votre tour de placement.";
  return null;
}

// Renvoie 1 pour le 1er placement de chaque joueur, 2 pour le second.
function setupPlacementNumber(state) {
  return state.setupIndex < state.playerOrder.length ? 1 : 2;
}

function setupPlaceSettlement(state, socketId, vertexId) {
  const turnError = assertSetupTurn(state, socketId);
  if (turnError) return { ok: false, error: turnError };
  if (state.setupStep !== 'settlement') {
    return { ok: false, error: 'Vous devez placer votre route de départ avant de continuer.' };
  }
  const vertex = state.board.vertices[vertexId];
  if (!vertex) return { ok: false, error: 'Intersection invalide.' };
  if (isVertexOccupied(state, vertexId)) {
    return { ok: false, error: 'Il y a déjà une colonie ici.' };
  }
  const adjacents = getAdjacentVertexIds(state.board, vertexId);
  if (adjacents.some((adj) => isVertexOccupied(state, adj))) {
    return { ok: false, error: 'Trop proche d\'une autre colonie (règle de distance).' };
  }

  const player = state.players[socketId];
  const placementNumber = setupPlacementNumber(state);

  player.settlements.push(vertexId);
  state.setupStep = 'road';
  state.setupLastVertexId = vertexId;
  pushLog(state, `${player.name} place sa ${placementNumber === 1 ? '1ère' : '2ème'} colonie.`);

  // Règle standard Catan : seule la 2ème colonie de départ rapporte des
  // ressources immédiates (la 1ère n'en rapporte pas, pour ne pas avantager
  // le hasard du tirage au sort de l'ordre de jeu).
  if (placementNumber === 2) {
    const gains = grantInitialResources(state, player, vertexId);
    if (gains.length === 0) {
      pushLog(state, `${player.name} ne reçoit aucune ressource (colonie adjacente au désert uniquement).`);
    } else {
      gains.forEach((g) => {
        pushLog(state, `${player.name} reçoit 1 × ${g.resource} (ressource de départ).`);
      });
    }
  }

  pushLog(state, `${player.name} : placez votre route reliée à cette colonie.`);
  return { ok: true };
}

// Distribue immédiatement les ressources des tuiles adjacentes à une
// colonie qu'on vient de poser (désert exclu). Utilisé pour la 2ème colonie
// de départ.
function grantInitialResources(state, player, vertexId) {
  const gains = [];
  state.board.tiles.forEach((tile) => {
    if (tile.resource === 'desert') return;
    if (tile.vertexIds.includes(vertexId)) {
      player.resources[tile.resource] += 1;
      gains.push({ resource: tile.resource });
    }
  });
  return gains;
}

function setupPlaceRoad(state, socketId, edgeId) {
  const turnError = assertSetupTurn(state, socketId);
  if (turnError) return { ok: false, error: turnError };
  if (state.setupStep !== 'road') {
    return { ok: false, error: 'Vous devez placer une colonie avant.' };
  }
  const edge = state.board.edges[edgeId];
  if (!edge) return { ok: false, error: 'Arête invalide.' };
  if (isEdgeOccupied(state, edgeId)) {
    return { ok: false, error: 'Il y a déjà une route ici.' };
  }
  if (edge.v1 !== state.setupLastVertexId && edge.v2 !== state.setupLastVertexId) {
    return { ok: false, error: 'Cette route doit partir de la colonie que vous venez de placer.' };
  }

  const player = state.players[socketId];
  player.roads.push(edgeId);
  pushLog(state, `${player.name} place sa route de départ.`);

  state.setupIndex += 1;
  state.setupLastVertexId = null;

  if (state.setupIndex >= state.setupOrder.length) {
    // Mise en place terminée : démarrage de la partie réelle.
    state.status = 'playing';
    state.phase = 'roll';
    state.currentPlayerIndex = 0;
    state.turnNumber = 1;
    state.setupOrder = [];
    state.setupStep = null;
    updateLongestRoad(state);
    pushLog(state, 'Mise en place terminée ! La partie commence pour de vrai.');
    pushLog(state, `C'est au tour de ${state.players[currentPlayerId(state)].name}.`);
  } else {
    state.setupStep = 'settlement';
    const nextPlayer = state.players[currentPlayerId(state)];
    const nextPlacementNumber = setupPlacementNumber(state);
    pushLog(
      state,
      `${nextPlayer.name} : choisissez l'emplacement de votre ${nextPlacementNumber === 1 ? '1ère' : '2ème'} colonie.`
    );
  }

  return { ok: true };
}

// ---- Tour de jeu -------------------------------------------------------------------

function assertPlayersTurn(state, socketId) {
  if (state.status === 'finished') return 'La partie est terminée.';
  if (state.status !== 'playing') return 'La partie n\'est pas en cours.';
  if (currentPlayerId(state) !== socketId) return "Ce n'est pas votre tour.";
  return null;
}

function rollDice(state, socketId) {
  const turnError = assertPlayersTurn(state, socketId);
  if (turnError) return { ok: false, error: turnError };
  if (state.phase !== 'roll') {
    return { ok: false, error: 'Vous avez déjà lancé les dés ce tour-ci.' };
  }

  const die1 = 1 + Math.floor(Math.random() * 6);
  const die2 = 1 + Math.floor(Math.random() * 6);
  const total = die1 + die2;
  state.lastDiceRoll = { die1, die2, total };

  const gains = distributeResources(state, total);
  state.phase = 'build';

  const playerName = state.players[socketId].name;
  pushLog(state, `${playerName} lance les dés : ${die1} + ${die2} = ${total}.`);
  if (gains.length === 0) {
    pushLog(state, 'Aucune ressource distribuée pour ce résultat.');
  } else {
    gains.forEach((g) => {
      pushLog(state, `${state.players[g.playerId].name} reçoit ${g.amount} × ${g.resource}.`);
    });
  }

  return { ok: true, total, die1, die2, gains };
}

// Distribue les ressources à tous les joueurs ayant une colonie (ou une
// ville) adjacente à une tuile portant le numéro tiré. Une colonie rapporte
// 1 ressource par tuile adjacente correspondante, une ville en rapporte 2.
function distributeResources(state, diceTotal) {
  const gainsByPlayerResource = {}; // `${playerId}:${resource}` -> amount
  state.board.tiles.forEach((tile) => {
    if (tile.number !== diceTotal || tile.resource === 'desert') return;
    tile.vertexIds.forEach((vertexId) => {
      state.playerOrder.forEach((playerId) => {
        const player = state.players[playerId];
        if (player.settlements.includes(vertexId)) {
          const amount = player.cities.includes(vertexId) ? 2 : 1;
          player.resources[tile.resource] += amount;
          const key = `${playerId}:${tile.resource}`;
          gainsByPlayerResource[key] = (gainsByPlayerResource[key] || 0) + amount;
        }
      });
    });
  });

  return Object.entries(gainsByPlayerResource).map(([key, amount]) => {
    const [playerId, resource] = key.split(':');
    return { playerId, resource, amount };
  });
}

function hasEnoughResources(player, cost) {
  return Object.entries(cost).every(([resource, amount]) => player.resources[resource] >= amount);
}

function payCost(player, cost) {
  Object.entries(cost).forEach(([resource, amount]) => {
    player.resources[resource] -= amount;
  });
}

function buildRoad(state, socketId, edgeId) {
  const turnError = assertPlayersTurn(state, socketId);
  if (turnError) return { ok: false, error: turnError };
  if (state.phase !== 'build') {
    return { ok: false, error: 'Vous devez lancer les dés avant de construire.' };
  }
  const edge = state.board.edges[edgeId];
  if (!edge) return { ok: false, error: 'Arête invalide.' };
  if (isEdgeOccupied(state, edgeId)) {
    return { ok: false, error: 'Il y a déjà une route ici.' };
  }

  const player = state.players[socketId];
  if (!edgeConnectsToPlayerNetwork(state, player, edge)) {
    return { ok: false, error: 'La route doit être connectée à une de vos routes ou colonies.' };
  }

  if (!hasEnoughResources(player, BUILD_COSTS.route)) {
    return { ok: false, error: 'Ressources insuffisantes (1 bois + 1 argile requis).' };
  }

  payCost(player, BUILD_COSTS.route);
  player.roads.push(edgeId);
  pushLog(state, `${player.name} construit une route.`);
  updateLongestRoad(state);
  return { ok: true };
}

function edgeConnectsToPlayerNetwork(state, player, edge) {
  return (
    player.settlements.includes(edge.v1) ||
    player.settlements.includes(edge.v2) ||
    getEdgesForVertex(state.board, edge.v1).some((e) => player.roads.includes(e.id)) ||
    getEdgesForVertex(state.board, edge.v2).some((e) => player.roads.includes(e.id))
  );
}

function buildSettlement(state, socketId, vertexId) {
  const turnError = assertPlayersTurn(state, socketId);
  if (turnError) return { ok: false, error: turnError };
  if (state.phase !== 'build') {
    return { ok: false, error: 'Vous devez lancer les dés avant de construire.' };
  }
  const vertex = state.board.vertices[vertexId];
  if (!vertex) return { ok: false, error: 'Intersection invalide.' };
  if (isVertexOccupied(state, vertexId)) {
    return { ok: false, error: 'Il y a déjà une colonie ici.' };
  }
  const adjacents = getAdjacentVertexIds(state.board, vertexId);
  if (adjacents.some((adj) => isVertexOccupied(state, adj))) {
    return { ok: false, error: 'Trop proche d\'une autre colonie (règle de distance).' };
  }

  const player = state.players[socketId];
  const connectsToOwnRoad = getEdgesForVertex(state.board, vertexId).some((e) =>
    player.roads.includes(e.id)
  );
  if (!connectsToOwnRoad) {
    return { ok: false, error: 'La colonie doit être connectée à une de vos routes.' };
  }

  if (!hasEnoughResources(player, BUILD_COSTS.colonie)) {
    return { ok: false, error: 'Ressources insuffisantes (1 bois + 1 argile + 1 mouton + 1 blé requis).' };
  }

  payCost(player, BUILD_COSTS.colonie);
  player.settlements.push(vertexId);
  pushLog(state, `${player.name} construit une colonie.`);
  updateLongestRoad(state); // une colonie adverse peut couper une route existante
  return { ok: true };
}

// Améliore une colonie existante du joueur en ville (coût 2 blé + 3 minerai).
// Une ville rapporte 2 ressources par lancer de dé au lieu d'1, et vaut 2
// points de victoire au lieu d'1.
function buildCity(state, socketId, vertexId) {
  const turnError = assertPlayersTurn(state, socketId);
  if (turnError) return { ok: false, error: turnError };
  if (state.phase !== 'build') {
    return { ok: false, error: 'Vous devez lancer les dés avant de construire.' };
  }
  const vertex = state.board.vertices[vertexId];
  if (!vertex) return { ok: false, error: 'Intersection invalide.' };

  const player = state.players[socketId];
  if (!player.settlements.includes(vertexId)) {
    return { ok: false, error: 'Vous devez posséder une colonie ici pour l\'améliorer en ville.' };
  }
  if (player.cities.includes(vertexId)) {
    return { ok: false, error: 'Cette colonie est déjà une ville.' };
  }
  if (!hasEnoughResources(player, BUILD_COSTS.ville)) {
    return { ok: false, error: 'Ressources insuffisantes (2 blé + 3 minerai requis).' };
  }

  payCost(player, BUILD_COSTS.ville);
  player.cities.push(vertexId);
  pushLog(state, `${player.name} améliore une colonie en ville.`);
  checkForWinner(state);
  return { ok: true };
}

// ---- Cartes développement -----------------------------------------------------------

function buyDevCard(state, socketId) {
  const turnError = assertPlayersTurn(state, socketId);
  if (turnError) return { ok: false, error: turnError };
  if (state.phase !== 'build') {
    return { ok: false, error: 'Vous devez lancer les dés avant d\'acheter une carte.' };
  }
  if (state.devCardDeck.length === 0) {
    return { ok: false, error: 'Il ne reste plus de cartes développement dans la pioche.' };
  }
  const player = state.players[socketId];
  if (!hasEnoughResources(player, DEV_CARD_COST)) {
    return { ok: false, error: 'Ressources insuffisantes (1 mouton + 1 blé + 1 minerai requis).' };
  }

  payCost(player, DEV_CARD_COST);
  const type = state.devCardDeck.pop();
  player.devCards.push({ type, boughtOnTurn: state.turnNumber });
  // Le type acheté reste secret pour les autres joueurs : on ne le log pas publiquement.
  pushLog(state, `${player.name} achète une carte développement.`);
  // Une carte Point de Victoire tout juste achetée compte immédiatement pour
  // la victoire (règle standard Catan : pas besoin qu'elle soit "jouable").
  checkForWinner(state);
  return { ok: true, type };
}

function playDevCard(state, socketId, cardType, payload) {
  const turnError = assertPlayersTurn(state, socketId);
  if (turnError) return { ok: false, error: turnError };
  if (state.phase !== 'build') {
    return { ok: false, error: 'Vous devez lancer les dés avant de jouer une carte.' };
  }
  if (state.devCardPlayedThisTurn) {
    return { ok: false, error: 'Vous avez déjà joué une carte développement ce tour-ci.' };
  }
  if (!PLAYABLE_DEV_CARD_TYPES.includes(cardType)) {
    return { ok: false, error: 'Cette carte ne peut pas être jouée.' };
  }

  const player = state.players[socketId];
  const cardIndex = player.devCards.findIndex((c) => c.type === cardType && c.boughtOnTurn < state.turnNumber);
  if (cardIndex === -1) {
    return {
      ok: false,
      error: "Vous n'avez pas de carte de ce type jouable (une carte achetée ce tour-ci ne peut pas être jouée avant le tour suivant)."
    };
  }

  if (cardType === 'invention') {
    const picks = payload && Array.isArray(payload.resources) ? payload.resources : null;
    if (!picks || picks.length !== 2 || !picks.every((r) => RESOURCE_TYPES.includes(r))) {
      return { ok: false, error: 'Choisissez exactement 2 ressources pour Invention.' };
    }
    player.devCards.splice(cardIndex, 1);
    picks.forEach((r) => {
      player.resources[r] += 1;
    });
    pushLog(state, `${player.name} joue Invention et reçoit 2 ressources gratuites.`);
  } else if (cardType === 'monopole') {
    const resource = payload && payload.resource;
    if (!RESOURCE_TYPES.includes(resource)) {
      return { ok: false, error: 'Choisissez une ressource pour Monopole.' };
    }
    player.devCards.splice(cardIndex, 1);
    let total = 0;
    state.playerOrder.forEach((pid) => {
      if (pid === socketId) return;
      const other = state.players[pid];
      total += other.resources[resource];
      other.resources[resource] = 0;
    });
    player.resources[resource] += total;
    pushLog(state, `${player.name} joue Monopole sur ${resource} et récupère ${total} carte(s) au total.`);
  } else if (cardType === 'route') {
    player.devCards.splice(cardIndex, 1);
    state.freeRoadsRemaining = 2;
    pushLog(state, `${player.name} joue Construction de route : 2 routes gratuites à placer ce tour-ci.`);
  }

  state.devCardPlayedThisTurn = true;
  return { ok: true };
}

// Placement d'une route gratuite suite à la carte "Route" (Road Building).
// Mêmes règles de connexion que buildRoad, mais sans coût.
function buildFreeRoad(state, socketId, edgeId) {
  const turnError = assertPlayersTurn(state, socketId);
  if (turnError) return { ok: false, error: turnError };
  if (state.freeRoadsRemaining <= 0) {
    return { ok: false, error: "Vous n'avez pas de route gratuite à placer." };
  }
  const edge = state.board.edges[edgeId];
  if (!edge) return { ok: false, error: 'Arête invalide.' };
  if (isEdgeOccupied(state, edgeId)) {
    return { ok: false, error: 'Il y a déjà une route ici.' };
  }
  const player = state.players[socketId];
  if (!edgeConnectsToPlayerNetwork(state, player, edge)) {
    return { ok: false, error: 'La route doit être connectée à une de vos routes ou colonies.' };
  }

  player.roads.push(edgeId);
  state.freeRoadsRemaining -= 1;
  pushLog(state, `${player.name} place une route gratuite (${2 - state.freeRoadsRemaining}/2).`);
  updateLongestRoad(state);
  return { ok: true };
}

// ---- Échanges -------------------------------------------------------------------------

function sanitizeResourceMap(map) {
  const result = emptyResources();
  if (map && typeof map === 'object') {
    RESOURCE_TYPES.forEach((r) => {
      const v = Number(map[r]);
      if (Number.isFinite(v) && v > 0) result[r] = Math.floor(v);
    });
  }
  return result;
}

function sumResourceMap(map) {
  return Object.values(map).reduce((a, b) => a + b, 0);
}

function proposeTrade(state, socketId, offering, requesting) {
  const turnError = assertPlayersTurn(state, socketId);
  if (turnError) return { ok: false, error: turnError };
  if (state.phase !== 'build') {
    return { ok: false, error: 'Vous devez lancer les dés avant de proposer un échange.' };
  }
  if (state.pendingTrade) {
    return { ok: false, error: 'Une offre d\'échange est déjà en cours.' };
  }

  const cleanOffering = sanitizeResourceMap(offering);
  const cleanRequesting = sanitizeResourceMap(requesting);
  if (sumResourceMap(cleanOffering) === 0 || sumResourceMap(cleanRequesting) === 0) {
    return { ok: false, error: 'Indiquez au moins une ressource des deux côtés de l\'échange.' };
  }

  const player = state.players[socketId];
  if (!hasEnoughResources(player, cleanOffering)) {
    return { ok: false, error: 'Vous ne possédez pas les ressources que vous proposez.' };
  }

  state.tradeSeq += 1;
  state.pendingTrade = {
    id: state.tradeSeq,
    fromPlayerId: socketId,
    offering: cleanOffering,
    requesting: cleanRequesting
  };
  pushLog(state, `${player.name} propose un échange à tous les joueurs.`);
  return { ok: true };
}

function cancelTrade(state, socketId) {
  if (!state.pendingTrade) {
    return { ok: false, error: 'Aucune offre en cours.' };
  }
  if (state.pendingTrade.fromPlayerId !== socketId) {
    return { ok: false, error: 'Seul l\'auteur de l\'offre peut l\'annuler.' };
  }
  const player = state.players[socketId];
  state.pendingTrade = null;
  pushLog(state, `${player.name} annule son offre d'échange.`);
  return { ok: true };
}

function acceptTrade(state, socketId, tradeId) {
  if (!state.pendingTrade || state.pendingTrade.id !== tradeId) {
    return { ok: false, error: 'Cette offre n\'est plus disponible.' };
  }
  const trade = state.pendingTrade;
  if (trade.fromPlayerId === socketId) {
    return { ok: false, error: 'Vous ne pouvez pas accepter votre propre offre.' };
  }
  const proposer = state.players[trade.fromPlayerId];
  const accepter = state.players[socketId];
  if (!proposer || !accepter) return { ok: false, error: 'Joueur introuvable.' };

  if (!hasEnoughResources(proposer, trade.offering)) {
    state.pendingTrade = null;
    return { ok: false, error: 'Le proposant n\'a plus les ressources promises : offre annulée.' };
  }
  if (!hasEnoughResources(accepter, trade.requesting)) {
    return { ok: false, error: 'Vous n\'avez pas les ressources demandées par cette offre.' };
  }

  payCost(proposer, trade.offering);
  payCost(accepter, trade.requesting);
  RESOURCE_TYPES.forEach((r) => {
    proposer.resources[r] += trade.requesting[r];
    accepter.resources[r] += trade.offering[r];
  });

  pushLog(state, `${accepter.name} accepte l'échange proposé par ${proposer.name}.`);
  state.pendingTrade = null;
  return { ok: true };
}

function bankTrade(state, socketId, give, receive) {
  const turnError = assertPlayersTurn(state, socketId);
  if (turnError) return { ok: false, error: turnError };
  if (state.phase !== 'build') {
    return { ok: false, error: 'Vous devez lancer les dés avant d\'échanger avec la banque.' };
  }
  if (!RESOURCE_TYPES.includes(give) || !RESOURCE_TYPES.includes(receive)) {
    return { ok: false, error: 'Ressource invalide.' };
  }
  if (give === receive) {
    return { ok: false, error: 'Choisissez deux ressources différentes.' };
  }
  const player = state.players[socketId];
  if (player.resources[give] < BANK_TRADE_RATE) {
    return { ok: false, error: `Il vous faut ${BANK_TRADE_RATE} × ${give} pour échanger avec la banque.` };
  }

  player.resources[give] -= BANK_TRADE_RATE;
  player.resources[receive] += 1;
  pushLog(state, `${player.name} échange ${BANK_TRADE_RATE} ${give} contre 1 ${receive} à la banque.`);
  return { ok: true };
}

function endTurn(state, socketId) {
  const turnError = assertPlayersTurn(state, socketId);
  if (turnError) return { ok: false, error: turnError };
  if (state.phase !== 'build') {
    return { ok: false, error: 'Vous devez lancer les dés avant de terminer votre tour.' };
  }

  const playerName = state.players[socketId].name;
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.playerOrder.length;
  state.turnNumber += 1;
  state.phase = 'roll';
  state.lastDiceRoll = null;
  state.devCardPlayedThisTurn = false;
  state.freeRoadsRemaining = 0;
  state.pendingTrade = null;
  pushLog(state, `${playerName} termine son tour.`);
  pushLog(state, `C'est au tour de ${state.players[currentPlayerId(state)].name}.`);
  return { ok: true };
}

// ---- Route la plus longue --------------------------------------------------------------

// Calcule la plus longue chaîne continue de routes d'un joueur (en nombre de
// routes), en tenant compte de la règle officielle : la chaîne est coupée si
// elle doit traverser une intersection occupée par la colonie d'un AUTRE
// joueur (on peut y arriver, mais pas continuer au-delà).
function computeLongestRoadForPlayer(state, playerId) {
  const player = state.players[playerId];
  if (player.roads.length === 0) return 0;

  const adjacency = {}; // vertexId -> [{ edgeId, to }]
  player.roads.forEach((edgeId) => {
    const edge = state.board.edges[edgeId];
    (adjacency[edge.v1] ||= []).push({ edgeId, to: edge.v2 });
    (adjacency[edge.v2] ||= []).push({ edgeId, to: edge.v1 });
  });

  function opponentOwnsVertex(vertexId) {
    return state.playerOrder.some(
      (pid) => pid !== playerId && state.players[pid].settlements.includes(vertexId)
    );
  }

  let best = 0;

  function dfs(vertex, usedEdges) {
    if (usedEdges.size > best) best = usedEdges.size;
    if (opponentOwnsVertex(vertex)) return; // on ne peut pas continuer au-delà d'une colonie adverse
    const neighbors = adjacency[vertex] || [];
    neighbors.forEach(({ edgeId, to }) => {
      if (usedEdges.has(edgeId)) return;
      usedEdges.add(edgeId);
      dfs(to, usedEdges);
      usedEdges.delete(edgeId);
    });
  }

  Object.keys(adjacency).forEach((startVertex) => dfs(startVertex, new Set()));
  return best;
}

// Recalcule la longueur de route de chaque joueur et met à jour le
// détenteur du titre "Route la plus longue". Le titre ne change de main
// que si un autre joueur dépasse STRICTEMENT la longueur du détenteur
// actuel (les égalités ne font pas perdre le titre), et il faut au moins
// LONGEST_ROAD_MIN_LENGTH routes pour y prétendre.
function updateLongestRoad(state) {
  if (!state.board) return;
  const lengths = {};
  state.playerOrder.forEach((pid) => {
    lengths[pid] = computeLongestRoadForPlayer(state, pid);
  });
  state.roadLengths = lengths;

  const currentHolder = state.longestRoadHolder && lengths[state.longestRoadHolder] !== undefined
    ? state.longestRoadHolder
    : null;
  let bestPid = currentHolder;
  let bestLen = currentHolder ? lengths[currentHolder] : LONGEST_ROAD_MIN_LENGTH - 1;

  state.playerOrder.forEach((pid) => {
    if (lengths[pid] >= LONGEST_ROAD_MIN_LENGTH && lengths[pid] > bestLen) {
      bestLen = lengths[pid];
      bestPid = pid;
    }
  });

  if (bestPid !== state.longestRoadHolder) {
    state.longestRoadHolder = bestPid;
    if (bestPid) {
      pushLog(state, `${state.players[bestPid].name} obtient le titre "Route la plus longue" (${bestLen} routes).`);
    }
  }

  // Après toute construction (route, colonie) ou changement de titre, un
  // joueur peut avoir atteint le score de victoire.
  checkForWinner(state);
}

// ---- Fin de partie ------------------------------------------------------------------

// Renvoie le score total d'un joueur (points publics + cartes Point de
// Victoire secrètes). Utilisé uniquement pour détecter la victoire : le
// détail des cartes secrètes n'est jamais renvoyé aux autres joueurs avant
// que la victoire ne soit effectivement déclarée.
function computeTotalVictoryPoints(state, playerId) {
  return computePublicVictoryPoints(state, playerId) + countHiddenVictoryPoints(state.players[playerId]);
}

// Vérifie si un joueur a atteint (ou dépassé) le score de victoire et, le
// cas échéant, termine la partie immédiatement. Idempotent : si la partie
// est déjà terminée, ne fait rien.
function checkForWinner(state) {
  if (!state.board || state.status !== 'playing') return;
  const winnerId = state.playerOrder.find((pid) => computeTotalVictoryPoints(state, pid) >= WINNING_SCORE);
  if (!winnerId) return;

  state.status = 'finished';
  state.winnerId = winnerId;
  const winner = state.players[winnerId];
  const finalScore = computeTotalVictoryPoints(state, winnerId);
  pushLog(state, `🏆 ${winner.name} remporte la partie avec ${finalScore} points de victoire !`);
}

// Réinitialise la partie vers un salon d'attente propre en conservant les
// joueurs actuellement connectés (mêmes noms, nouvelles couleurs/ordre).
// Ne fait rien si la partie n'est pas terminée.
function newGame(state) {
  if (state.status !== 'finished') {
    return { ok: false, error: "La partie n'est pas terminée." };
  }
  const remainingPlayers = state.playerOrder.map((id) => ({ id, name: state.players[id].name }));
  Object.assign(state, createInitialState());
  remainingPlayers.forEach((p, idx) => {
    state.players[p.id] = createPlayer(p.id, p.name, PLAYER_COLORS[idx]);
    state.playerOrder.push(p.id);
  });
  pushLog(state, "Nouvelle partie ! Retour au salon d'attente.");
  return { ok: true };
}

// ---- Vue publique / privée de l'état -----------------------------------------------

// Regroupe les cartes dev d'un joueur par type, avec le nombre total et le
// nombre actuellement jouable (pas achetées ce tour-ci). Uniquement pour la
// vue privée du propriétaire.
function summarizeOwnDevCards(devCards, turnNumber) {
  const summary = {};
  devCards.forEach((c) => {
    if (!summary[c.type]) summary[c.type] = { total: 0, playable: 0 };
    summary[c.type].total += 1;
    if (c.boughtOnTurn < turnNumber) summary[c.type].playable += 1;
  });
  return summary;
}

// Points de victoire publics : ce que tout le monde peut déjà déduire du
// plateau (colonies, villes, titre de route la plus longue). N'inclut PAS
// les cartes Point de Victoire en main, qui restent secrètes.
function computePublicVictoryPoints(state, playerId) {
  const player = state.players[playerId];
  const simpleSettlements = player.settlements.length - player.cities.length;
  let points = simpleSettlements * VICTORY_POINTS.colonie + player.cities.length * VICTORY_POINTS.ville;
  if (state.longestRoadHolder === playerId) {
    points += VICTORY_POINTS.longestRoad;
  }
  return points;
}

// Nombre de cartes Point de Victoire dans la main d'un joueur (information
// privée, ne compte que pour son propre total).
function countHiddenVictoryPoints(player) {
  return player.devCards.filter((c) => c.type === 'victoire').length;
}

function sanitizePlayerForViewer(state, playerId, viewerId) {
  const player = state.players[playerId];
  const isOwner = playerId === viewerId;
  const totalResources = Object.values(player.resources).reduce((a, b) => a + b, 0);
  const publicVictoryPoints = computePublicVictoryPoints(state, playerId);
  // Quand la partie est terminée, le gagnant retourne ses cartes Point de
  // Victoire secrètes pour prouver son score final — comme à la table.
  const revealHidden = isOwner || (state.status === 'finished' && state.winnerId === playerId);

  const base = {
    id: player.id,
    name: player.name,
    color: player.color,
    settlements: player.settlements,
    cities: player.cities,
    roads: player.roads,
    resourceCount: totalResources,
    devCardCount: player.devCards.length,
    victoryPoints: publicVictoryPoints
  };

  if (isOwner) {
    base.resources = player.resources;
    base.devCards = summarizeOwnDevCards(player.devCards, state.turnNumber);
  }

  if (revealHidden) {
    base.hiddenVictoryPoints = countHiddenVictoryPoints(player);
    base.totalVictoryPoints = publicVictoryPoints + base.hiddenVictoryPoints;
  }

  return base;
}

// Vue de l'état envoyée à UN client donné : ses propres ressources et cartes
// développement sont détaillées, celles des autres joueurs sont résumées à
// un simple total (nombre de cartes) pour ne pas révéler d'information
// cachée — c'est la seule différence entre joueurs, tout le reste (plateau,
// routes, colonies, tour en cours...) est public comme avant.
function getPublicStateFor(state, viewerId) {
  const players = {};
  state.playerOrder.forEach((pid) => {
    players[pid] = sanitizePlayerForViewer(state, pid, viewerId);
  });

  return {
    status: state.status,
    board: state.board,
    players,
    playerOrder: state.playerOrder,
    currentPlayerId: currentPlayerId(state),
    phase: state.phase,
    lastDiceRoll: state.lastDiceRoll,
    log: state.log.slice(-30),
    setup:
      state.status === 'setup'
        ? { step: state.setupStep, placementNumber: setupPlacementNumber(state) }
        : null,
    devCardDeckRemaining: state.devCardDeck.length,
    devCardPlayedThisTurn: state.devCardPlayedThisTurn,
    freeRoadsRemaining: state.freeRoadsRemaining,
    pendingTrade: state.pendingTrade,
    longestRoadHolder: state.longestRoadHolder,
    roadLengths: state.roadLengths,
    winnerId: state.winnerId,
    winningScore: WINNING_SCORE
  };
}

module.exports = {
  createInitialState,
  addPlayer,
  removePlayer,
  startGame,
  setupPlaceSettlement,
  setupPlaceRoad,
  rollDice,
  buildRoad,
  buildSettlement,
  buildCity,
  buyDevCard,
  playDevCard,
  buildFreeRoad,
  proposeTrade,
  cancelTrade,
  acceptTrade,
  bankTrade,
  endTurn,
  newGame,
  getPublicStateFor,
  currentPlayerId,
  // Exportées surtout pour les tests / le débogage (calcul de la route la
  // plus longue) ; updateLongestRoad est déjà appelée automatiquement après
  // chaque construction de route ou de colonie.
  computeLongestRoadForPlayer,
  updateLongestRoad
};
