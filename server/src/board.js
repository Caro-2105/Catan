// Génération du plateau hexagonal (19 tuiles, disposition classique Catan).
//
// Approche : on place les 19 hexagones en coordonnées axiales (q, r), on
// calcule leur centre en pixels, puis les 6 coins de chaque hexagone en
// pixels. Deux tuiles voisines partagent des coins qui tombent exactement
// aux mêmes coordonnées pixel : en arrondissant ces coordonnées et en les
// utilisant comme identifiant, on obtient automatiquement un graphe de
// sommets (intersections) et d'arêtes (segments de route) partagé entre
// tuiles voisines, sans avoir à gérer la topologie hexagonale à la main.

const { RESOURCE_TYPES, TILE_RESOURCE_COUNTS, DESERT_COUNT, NUMBER_TOKENS } = require('./constants');

const HEX_SIZE = 60; // rayon du hexagone en pixels, sert de base à tout le layout
const BOARD_RADIUS = 2; // rayon 2 en coordonnées cube => 19 tuiles

function shuffle(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function generateHexCoords(radius) {
  const coords = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      const s = -q - r;
      if (Math.abs(s) <= radius) {
        coords.push({ q, r });
      }
    }
  }
  return coords;
}

// Hexagones "pointy-top" (pointe en haut), formules standard axial -> pixel.
function hexToPixel(q, r, size) {
  const x = size * Math.sqrt(3) * (q + r / 2);
  const y = size * 1.5 * r;
  return { x, y };
}

function hexCorners(center, size) {
  const corners = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i - 30;
    const angleRad = (Math.PI / 180) * angleDeg;
    corners.push({
      x: center.x + size * Math.cos(angleRad),
      y: center.y + size * Math.sin(angleRad)
    });
  }
  return corners;
}

// Arrondi pour que deux coins théoriquement identiques (calculés depuis deux
// tuiles voisines différentes) produisent exactement la même clé malgré les
// imprécisions flottantes.
function pointKey(point) {
  return `${Math.round(point.x * 100)}_${Math.round(point.y * 100)}`;
}

function edgeKey(vertexIdA, vertexIdB) {
  return [vertexIdA, vertexIdB].sort().join('|');
}

function buildResourceDeck() {
  const deck = [];
  RESOURCE_TYPES.forEach((resource) => {
    for (let i = 0; i < TILE_RESOURCE_COUNTS[resource]; i++) {
      deck.push(resource);
    }
  });
  for (let i = 0; i < DESERT_COUNT; i++) {
    deck.push('desert');
  }
  return shuffle(deck);
}

function generateBoard() {
  const hexCoords = generateHexCoords(BOARD_RADIUS);
  const resourceDeck = buildResourceDeck();
  const numberDeck = shuffle(NUMBER_TOKENS);

  const vertices = {}; // id -> { id, x, y, tileIds: [] }
  const edges = {}; // id -> { id, v1, v2, tileIds: [] }
  const tiles = [];

  let numberIndex = 0;

  hexCoords.forEach((coord, index) => {
    const center = hexToPixel(coord.q, coord.r, HEX_SIZE);
    const corners = hexCorners(center, HEX_SIZE);
    const resource = resourceDeck[index];
    const number = resource === 'desert' ? null : numberDeck[numberIndex++];

    const tileId = `tile_${index}`;
    const vertexIds = corners.map((corner) => {
      const key = pointKey(corner);
      if (!vertices[key]) {
        vertices[key] = { id: key, x: corner.x, y: corner.y, tileIds: [] };
      }
      if (!vertices[key].tileIds.includes(tileId)) {
        vertices[key].tileIds.push(tileId);
      }
      return key;
    });

    const edgeIds = [];
    for (let i = 0; i < 6; i++) {
      const a = vertexIds[i];
      const b = vertexIds[(i + 1) % 6];
      const key = edgeKey(a, b);
      if (!edges[key]) {
        edges[key] = { id: key, v1: a, v2: b, tileIds: [] };
      }
      if (!edges[key].tileIds.includes(tileId)) {
        edges[key].tileIds.push(tileId);
      }
      edgeIds.push(key);
    }

    tiles.push({
      id: tileId,
      q: coord.q,
      r: coord.r,
      x: center.x,
      y: center.y,
      resource,
      number,
      vertexIds,
      edgeIds
    });
  });

  return { tiles, vertices, edges, hexSize: HEX_SIZE };
}

// Sommets adjacents à un sommet donné, déduits du graphe d'arêtes.
// Sert à la fois à la règle de distance (deux colonies ne peuvent pas être
// adjacentes) et à choisir aléatoirement des emplacements de départ valides.
function getAdjacentVertexIds(board, vertexId) {
  const adjacent = [];
  Object.values(board.edges).forEach((edge) => {
    if (edge.v1 === vertexId) adjacent.push(edge.v2);
    if (edge.v2 === vertexId) adjacent.push(edge.v1);
  });
  return adjacent;
}

// Arêtes incidentes à un sommet donné.
function getEdgesForVertex(board, vertexId) {
  return Object.values(board.edges).filter((edge) => edge.v1 === vertexId || edge.v2 === vertexId);
}

module.exports = {
  generateBoard,
  getAdjacentVertexIds,
  getEdgesForVertex,
  HEX_SIZE
};
