// Constantes de règles du jeu (version simplifiée / MVP)

const RESOURCE_TYPES = ['bois', 'argile', 'mouton', 'ble', 'minerai'];

// Répartition classique des tuiles Catan (19 tuiles au total : 18 tuiles à
// ressource + 1 désert). Le désert ne produit rien et n'a pas de jeton.
const TILE_RESOURCE_COUNTS = {
  bois: 4,
  argile: 3,
  mouton: 4,
  ble: 4,
  minerai: 3
};
const DESERT_COUNT = 1;

// Jetons numérotés classiques (pas de 7, puisqu'on ne code pas le voleur).
const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

const BUILD_COSTS = {
  route: { bois: 1, argile: 1 },
  colonie: { bois: 1, argile: 1, mouton: 1, ble: 1 },
  ville: { ble: 2, minerai: 3 }
};

// Points de victoire (publics, calculés à partir de ce que tout le monde
// voit déjà sur le plateau : colonies, villes, route la plus longue). Les
// cartes Point de Victoire en main restent secrètes et ne comptent que dans
// le total privé du joueur qui les possède.
const VICTORY_POINTS = {
  colonie: 1,
  ville: 2,
  longestRoad: 2
};

// Cartes développement : pas de Chevalier / Voleur dans ce MVP (choix
// explicite pour ne pas avoir à coder la règle du voleur). Le paquet est
// donc recomposé avec plus de cartes des 4 autres types pour rester
// intéressant à jouer : Route (construction gratuite de 2 routes),
// Invention (2 ressources gratuites au choix), Monopole (récupère toutes
// les cartes d'une ressource chez les autres joueurs), Point de Victoire
// (carte gardée secrète, ne se "joue" pas).
const DEV_CARD_COST = { mouton: 1, ble: 1, minerai: 1 };
const DEV_CARD_COUNTS = { route: 3, invention: 3, monopole: 3, victoire: 5 };

// Taux d'échange avec la banque (pas de ports dans ce MVP, donc taux unique
// pour tout le monde).
const BANK_TRADE_RATE = 4;

const PLAYER_COLORS = ['#e63946', '#457b9d', '#2a9d8f', '#f4a261'];

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;

const INITIAL_SETTLEMENTS_PER_PLAYER = 2;
const INITIAL_ROADS_PER_PLAYER = 2;

// Longueur minimale pour prétendre au titre de "route la plus longue".
const LONGEST_ROAD_MIN_LENGTH = 5;

// Score (points de victoire publics + cartes Point de Victoire secrètes
// comprises) à atteindre pour gagner immédiatement la partie — règle
// standard Catan.
const WINNING_SCORE = 10;

module.exports = {
  RESOURCE_TYPES,
  TILE_RESOURCE_COUNTS,
  DESERT_COUNT,
  NUMBER_TOKENS,
  BUILD_COSTS,
  VICTORY_POINTS,
  DEV_CARD_COST,
  DEV_CARD_COUNTS,
  BANK_TRADE_RATE,
  PLAYER_COLORS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  INITIAL_SETTLEMENTS_PER_PLAYER,
  INITIAL_ROADS_PER_PLAYER,
  LONGEST_ROAD_MIN_LENGTH,
  WINNING_SCORE
};
