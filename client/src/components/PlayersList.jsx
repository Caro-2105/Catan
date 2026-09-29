import React from 'react';

export default function PlayersList({ gameState, myId }) {
  const { players, playerOrder, currentPlayerId, phase, status, setup, longestRoadHolder, roadLengths } = gameState;

  function turnLabel(playerId) {
    if (playerId !== currentPlayerId) return null;
    if (status === 'setup') {
      const step = setup.step === 'settlement' ? 'place sa colonie' : 'place sa route';
      return `— en train de placer sa ${setup.placementNumber === 1 ? '1ère' : '2ème'} colonie (${step})`;
    }
    return `— tour en cours (${phase === 'roll' ? 'doit lancer les dés' : 'construction'})`;
  }

  return (
    <div className="panel players-list">
      <h3>🏆 Joueurs</h3>
      <ul>
        {playerOrder.map((id) => {
          const p = players[id];
          const isCurrent = id === currentPlayerId;
          const isMe = id === myId;
          const label = turnLabel(id);
          const cityCount = p.cities ? p.cities.length : 0;
          const settlementCount = p.settlements.length - cityCount;
          const vpValue = isMe && typeof p.totalVictoryPoints === 'number' ? p.totalVictoryPoints : p.victoryPoints;
          const vpTitle =
            isMe && typeof p.hiddenVictoryPoints === 'number' && p.hiddenVictoryPoints > 0
              ? `dont ${p.hiddenVictoryPoints} point(s) secret(s)`
              : undefined;
          const initial = (p.name || '?').trim().charAt(0).toUpperCase();

          return (
            <li key={id} className={`player-row${isCurrent ? ' current-player' : ''}`}>
              <div className="player-row-main">
                <span className="player-avatar" style={{ background: p.color }}>
                  {initial}
                </span>
                <span className="player-row-name">
                  {p.name}
                  {isMe ? ' (vous)' : ''}
                </span>
                {label && <span className="turn-tag">{label}</span>}
              </div>
              <div className="player-row-stats">
                <span className="vp-badge" title={vpTitle}>
                  🏅 {vpValue} pt{vpValue > 1 ? 's' : ''}
                </span>
                <span className="stat-chip">🏠 {settlementCount}</span>
                {cityCount > 0 && <span className="stat-chip">🏰 {cityCount}</span>}
                <span className="stat-chip">🃏 {p.resourceCount}</span>
                <span className="stat-chip">📇 {p.devCardCount}</span>
                {roadLengths && roadLengths[id] > 0 && <span className="stat-chip">🛤️ {roadLengths[id]}</span>}
              </div>
              {longestRoadHolder === id && (
                <span className="longest-road-badge">🏆 Route la plus longue</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
