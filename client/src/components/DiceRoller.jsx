import React from 'react';
import { socket } from '../socket.js';

export default function DiceRoller({ isMyTurn, phase, lastDiceRoll }) {
  const canRoll = isMyTurn && phase === 'roll';
  // Clé stable tant que le résultat ne change pas : ré-appliquer cette clé
  // ne relance l'animation CSS qu'au moment d'un nouveau lancer, pas à
  // chaque mise à jour d'état reçue par websocket entre-temps.
  const rollKey = lastDiceRoll ? `${lastDiceRoll.die1}-${lastDiceRoll.die2}` : 'none';

  function handleRoll() {
    socket.emit('roll_dice');
  }

  return (
    <div className="panel dice-roller">
      <h3>🎲 Dés</h3>
      <div className="dice-display dice-roll-anim" key={rollKey}>
        {lastDiceRoll ? (
          <>
            <span className="die">{lastDiceRoll.die1}</span>
            <span className="die">{lastDiceRoll.die2}</span>
            <span className="dice-total">= {lastDiceRoll.total}</span>
          </>
        ) : (
          <span className="hint">Aucun lancer pour l'instant</span>
        )}
      </div>
      <button onClick={handleRoll} disabled={!canRoll} className="primary">
        🎲 Lancer les dés
      </button>
    </div>
  );
}
