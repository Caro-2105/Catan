import React, { useState } from 'react';
import { socket } from '../socket.js';

export default function Lobby({ gameState, myId, errorMessage }) {
  const [name, setName] = useState('');
  const players = gameState ? Object.values(gameState.players) : [];
  const hasJoined = myId && gameState && gameState.players[myId];
  const canStart = players.length >= 2;

  function handleJoin(e) {
    e.preventDefault();
    if (!name.trim()) return;
    socket.emit('join_game', { name: name.trim() });
  }

  function handleStart() {
    socket.emit('start_game');
  }

  return (
    <div className="panel lobby">
      <h2>🏝️ Salon d'attente</h2>
      <p className="lobby-tagline">Rassemblez 2 à 4 joueurs, puis lancez la partie.</p>

      {!hasJoined && (
        <form onSubmit={handleJoin} className="join-form">
          <input
            type="text"
            placeholder="Votre prénom"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="primary">
            Rejoindre la partie
          </button>
        </form>
      )}

      {hasJoined && <p className="hint">✅ Vous êtes dans la partie, en attente des autres joueurs...</p>}

      {errorMessage && <p className="error">{errorMessage}</p>}

      <h3>👥 Joueurs connectés ({players.length}/4)</h3>
      <ul className="player-list">
        {players.map((p) => (
          <li key={p.id}>
            <span className="player-avatar" style={{ background: p.color }}>
              {(p.name || '?').trim().charAt(0).toUpperCase()}
            </span>
            {p.name}
            {p.id === myId ? ' (vous)' : ''}
          </li>
        ))}
        {players.length === 0 && <li className="hint">Personne pour le moment.</li>}
      </ul>

      {hasJoined && (
        <button onClick={handleStart} disabled={!canStart} className="primary">
          {canStart ? '🚀 Démarrer la partie' : "En attente d'au moins 2 joueurs..."}
        </button>
      )}
    </div>
  );
}
