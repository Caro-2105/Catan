import React, { useMemo } from 'react';

const RESOURCE_COLORS = {
  bois: '#2d6a4f',
  argile: '#bc6c25',
  mouton: '#74c69d',
  ble: '#e0ad2f',
  minerai: '#6f7d8f',
  desert: '#dcb98d'
};

const RESOURCE_SHORT = {
  bois: 'Bois',
  argile: 'Argile',
  mouton: 'Mouton',
  ble: 'Blé',
  minerai: 'Minerai',
  desert: 'Désert'
};

const RESOURCE_ICONS = {
  bois: '🪵',
  argile: '🧱',
  mouton: '🐑',
  ble: '🌾',
  minerai: '⛏️',
  desert: '🏜️'
};

// activeMode : null | 'vertex' | 'edge' | 'vertex-upgrade' — détermine quels
// éléments du plateau sont actuellement cliquables. Le composant ne connaît
// pas la différence entre "construire" (phase de jeu normale), "placer sa
// mise en place initiale" ou "améliorer en ville" : c'est App.jsx qui
// décide, via les callbacks onVertexActivate / onEdgeActivate, quel
// événement socket émettre. myId sert uniquement au mode 'vertex-upgrade',
// pour ne rendre cliquables que les colonies du joueur lui-même.
export default function GameBoard({ gameState, activeMode, onVertexActivate, onEdgeActivate, instructions, myId }) {
  const { board, players, playerOrder } = gameState;

  const { roadOwnerByEdge, settlementOwnerByVertex, cityOwnerByVertex } = useMemo(() => {
    const roadOwnerByEdge = {};
    const settlementOwnerByVertex = {};
    const cityOwnerByVertex = {};
    playerOrder.forEach((pid) => {
      const p = players[pid];
      p.roads.forEach((edgeId) => (roadOwnerByEdge[edgeId] = p));
      p.settlements.forEach((vertexId) => (settlementOwnerByVertex[vertexId] = p));
      (p.cities || []).forEach((vertexId) => (cityOwnerByVertex[vertexId] = p));
    });
    return { roadOwnerByEdge, settlementOwnerByVertex, cityOwnerByVertex };
  }, [players, playerOrder]);

  const { minX, minY, maxX, maxY } = useMemo(() => {
    const xs = Object.values(board.vertices).map((v) => v.x);
    const ys = Object.values(board.vertices).map((v) => v.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys)
    };
  }, [board]);

  const padding = 40;
  const viewBox = `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`;

  function handleVertexClick(vertexId) {
    if (activeMode !== 'vertex' && activeMode !== 'vertex-upgrade') return;
    onVertexActivate(vertexId);
  }

  function handleEdgeClick(edgeId) {
    if (activeMode !== 'edge') return;
    onEdgeActivate(edgeId);
  }

  return (
    <div className="panel game-board">
      <h3>🗺️ Plateau</h3>
      <div className="board-frame">
      <svg viewBox={viewBox} className={`board-svg mode-${activeMode || 'none'}`}>
        {/* Tuiles hexagonales */}
        {board.tiles.map((tile) => {
          const points = tile.vertexIds
            .map((vid) => board.vertices[vid])
            .map((v) => `${v.x},${v.y}`)
            .join(' ');
          return (
            <g key={tile.id}>
              <polygon
                points={points}
                fill={RESOURCE_COLORS[tile.resource]}
                stroke="#2b2118"
                strokeWidth="1.5"
              />
              <text
                x={tile.x}
                y={tile.y - 16}
                textAnchor="middle"
                fontSize="15"
                className="tile-resource-icon"
              >
                {RESOURCE_ICONS[tile.resource]}
              </text>
              {tile.number !== null && (
                <g>
                  <circle cx={tile.x} cy={tile.y} r="16" fill="#fdf6e3" stroke="#2b2118" strokeWidth="1" />
                  <text
                    x={tile.x}
                    y={tile.y + 5}
                    textAnchor="middle"
                    fontSize="16"
                    fontWeight={tile.number === 6 || tile.number === 8 ? 'bold' : 'normal'}
                    fill={tile.number === 6 || tile.number === 8 ? '#c0392b' : '#2b2118'}
                  >
                    {tile.number}
                  </text>
                </g>
              )}
              {tile.resource === 'desert' && (
                <text x={tile.x} y={tile.y + 30} textAnchor="middle" fontSize="10" fill="#5a4a3a">
                  {RESOURCE_SHORT.desert}
                </text>
              )}
            </g>
          );
        })}

        {/* Arêtes (routes potentielles ou construites) */}
        {Object.values(board.edges).map((edge) => {
          const v1 = board.vertices[edge.v1];
          const v2 = board.vertices[edge.v2];
          const owner = roadOwnerByEdge[edge.id];
          const clickable = activeMode === 'edge' && !owner;
          return (
            <line
              key={edge.id}
              x1={v1.x}
              y1={v1.y}
              x2={v2.x}
              y2={v2.y}
              stroke={owner ? owner.color : '#00000022'}
              strokeWidth={owner ? 6 : 10}
              strokeLinecap="round"
              className={clickable ? 'edge-clickable' : ''}
              onClick={() => handleEdgeClick(edge.id)}
            />
          );
        })}

        {/* Sommets (colonies/villes potentielles ou construites) */}
        {Object.values(board.vertices).map((vertex) => {
          const owner = settlementOwnerByVertex[vertex.id];
          const isCity = Boolean(cityOwnerByVertex[vertex.id]);
          const clickableToBuild = activeMode === 'vertex' && !owner;
          const clickableToUpgrade =
            activeMode === 'vertex-upgrade' && owner && owner.id === myId && !isCity;
          const clickable = clickableToBuild || clickableToUpgrade;
          return (
            <g key={vertex.id}>
              {clickable && (
                <circle
                  cx={vertex.x}
                  cy={vertex.y}
                  r={clickableToUpgrade ? 13 : 11}
                  fill="none"
                  stroke={clickableToUpgrade ? '#c8971f' : '#1f7a74'}
                  strokeWidth="2"
                  className="vertex-pulse"
                  pointerEvents="none"
                />
              )}
              <circle
                cx={vertex.x}
                cy={vertex.y}
                r={owner ? 9 : clickable ? 8 : 4}
                fill={owner ? owner.color : clickable ? '#ffffffcc' : '#2b211833'}
                stroke={clickableToUpgrade ? '#c8971f' : '#2b2118'}
                strokeWidth={owner ? (clickableToUpgrade ? 3 : 2) : 1}
                className={clickable ? 'vertex-clickable' : ''}
                onClick={() => handleVertexClick(vertex.id)}
              />
              {isCity && (
                <circle
                  cx={vertex.x}
                  cy={vertex.y}
                  r="4"
                  fill="#ffffff"
                  stroke={owner ? owner.color : '#2b2118'}
                  strokeWidth="1.5"
                  pointerEvents="none"
                />
              )}
            </g>
          );
        })}
      </svg>
      </div>

      <div className="board-legend">
        {Object.entries(RESOURCE_SHORT).map(([key, label]) => (
          <span key={key} className="board-legend-item">
            <span className="board-legend-swatch" style={{ background: RESOURCE_COLORS[key] }} />
            {RESOURCE_ICONS[key]} {label}
          </span>
        ))}
      </div>

      {instructions && <p className="hint build-hint">💡 {instructions}</p>}
    </div>
  );
}
