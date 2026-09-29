import React from 'react';

// Bannière de titre affichée sur tous les écrans (connexion, salon
// d'attente, partie). Quand une partie est en cours, elle affiche aussi un
// badge indiquant à qui c'est le tour et quoi faire, pour qu'on n'ait jamais
// à chercher l'info dans la liste des joueurs.
export default function Header({ gameState, myId }) {
  return (
    <header className="app-header">
      <div className="app-title">
        <span className="app-logo">🏝️</span> Catan MVP
      </div>
      {gameState && gameState.status !== 'lobby' && (
        <TurnIndicator gameState={gameState} myId={myId} />
      )}
    </header>
  );
}

function TurnIndicator({ gameState, myId }) {
  const { status, players, currentPlayerId, phase, setup } = gameState;

  if (status === 'finished') {
    const winner = players[gameState.winnerId];
    return (
      <div className="turn-indicator finished">
        🏁 Partie terminée{winner ? ` — ${winner.name} a gagné !` : ''}
      </div>
    );
  }

  const current = players[currentPlayerId];
  if (!current) return null;
  const isMine = currentPlayerId === myId;

  let text;
  if (status === 'setup') {
    const step = setup.step === 'settlement' ? 'place sa colonie' : 'place sa route';
    text = isMine ? `À vous : ${step}` : `${current.name} ${step}`;
  } else {
    const action = phase === 'roll' ? 'doit lancer les dés' : 'construit';
    text = isMine ? `À vous de jouer : ${action}` : `${current.name} ${action}`;
  }

  return (
    <div className={`turn-indicator${isMine ? ' mine' : ''}`}>
      <span className="turn-dot" style={{ background: isMine ? 'white' : current.color }} />
      {text}
    </div>
  );
}
