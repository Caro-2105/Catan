import React, { useMemo } from 'react';

const CONFETTI_COLORS = ['#e63946', '#457b9d', '#2a9d8f', '#f4a261', '#e9c46a', '#8d99ae'];

// Petite pluie de confettis en CSS pur (pas de dépendance externe) : un tas
// de <span> positionnés aléatoirement en haut de l'écran, chacun animé par
// une keyframe qui le fait tomber en tournoyant jusqu'en bas.
function Confetti() {
  const pieces = useMemo(() => {
    return Array.from({ length: 60 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 1.2,
      duration: 2.6 + Math.random() * 1.8,
      size: 6 + Math.random() * 6,
      rotate: Math.random() * 360
    }));
  }, []);

  return (
    <div className="confetti-layer" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            width: p.size,
            height: p.size * 0.4,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`
          }}
        />
      ))}
    </div>
  );
}

// Superposition plein écran affichée dès que la partie est terminée
// (gameState.status === 'finished'). gameState.players[winnerId] contient à
// ce stade totalVictoryPoints/hiddenVictoryPoints même pour les autres
// joueurs : le serveur "révèle" les cartes secrètes du gagnant à ce moment,
// exactement comme on retournerait ses cartes sur la table.
export default function VictoryOverlay({ gameState, myId, onNewGame }) {
  const { players, playerOrder, winnerId, winningScore } = gameState;
  const winner = players[winnerId];
  if (!winner) return null;

  const isMe = winnerId === myId;
  const finalScore = typeof winner.totalVictoryPoints === 'number' ? winner.totalVictoryPoints : winner.victoryPoints;

  const ranking = [...playerOrder]
    .map((id) => players[id])
    .sort((a, b) => {
      const scoreA = typeof a.totalVictoryPoints === 'number' ? a.totalVictoryPoints : a.victoryPoints;
      const scoreB = typeof b.totalVictoryPoints === 'number' ? b.totalVictoryPoints : b.victoryPoints;
      return scoreB - scoreA;
    });

  return (
    <div className="victory-overlay">
      <Confetti />
      <div className="victory-card">
        <div className="victory-trophy">🏆</div>
        <h2>{isMe ? 'Vous remportez la partie !' : `${winner.name} remporte la partie !`}</h2>
        <p className="victory-score">
          <span className="color-dot" style={{ background: winner.color }} /> {winner.name} — {finalScore} points de
          victoire{winningScore ? ` (objectif : ${winningScore})` : ''}
        </p>

        <ol className="victory-ranking">
          {ranking.map((p, idx) => {
            const score = typeof p.totalVictoryPoints === 'number' ? p.totalVictoryPoints : p.victoryPoints;
            return (
              <li key={p.id} className={p.id === winnerId ? 'winner' : ''}>
                <span className="rank">#{idx + 1}</span>
                <span className="color-dot" style={{ background: p.color }} />
                {p.name}
                <span className="rank-score">{score} pt(s)</span>
              </li>
            );
          })}
        </ol>

        <button className="primary" onClick={onNewGame}>
          Nouvelle partie
        </button>
      </div>
    </div>
  );
}
