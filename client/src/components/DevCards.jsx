import React, { useState } from 'react';
import { socket } from '../socket.js';
import { RESOURCE_LABELS } from './PlayerResources.jsx';
import { DEV_CARD_COST } from '../buildCosts.js';

const DEV_CARD_LABELS = {
  route: { label: 'Construction de route', icon: '🛤️', hint: 'Place 2 routes gratuitement.' },
  invention: { label: 'Invention', icon: '✨', hint: 'Recevez 2 ressources gratuites au choix.' },
  monopole: { label: 'Monopole', icon: '🕸️', hint: 'Récupérez toutes les cartes d\'une ressource chez les autres joueurs.' },
  victoire: { label: 'Point de Victoire', icon: '⭐', hint: 'Ne se joue pas : compte secrètement pour vos points de victoire.' }
};

export default function DevCards({ gameState, myId, isMyTurn }) {
  const me = gameState.players[myId];
  const [activeAction, setActiveAction] = useState(null); // null | 'invention' | 'monopole'
  const [inventionPicks, setInventionPicks] = useState(['bois', 'bois']);
  const [monopoleResource, setMonopoleResource] = useState('bois');

  if (!me || !me.devCards) return null;

  const canAct = isMyTurn && gameState.phase === 'build';
  const canBuy = canAct && gameState.devCardDeckRemaining > 0;
  const canPlayAny = canAct && !gameState.devCardPlayedThisTurn && gameState.freeRoadsRemaining === 0;

  const entries = Object.entries(me.devCards);

  function handleBuy() {
    socket.emit('buy_dev_card');
  }

  function handlePlaySimple(cardType) {
    socket.emit('play_dev_card', { cardType });
  }

  function handleStartInvention() {
    setActiveAction('invention');
  }

  function handleConfirmInvention() {
    socket.emit('play_dev_card', { cardType: 'invention', resources: inventionPicks });
    setActiveAction(null);
  }

  function handleStartMonopole() {
    setActiveAction('monopole');
  }

  function handleConfirmMonopole() {
    socket.emit('play_dev_card', { cardType: 'monopole', resource: monopoleResource });
    setActiveAction(null);
  }

  return (
    <div className="panel dev-cards">
      <h3>🃏 Cartes développement</h3>
      <div className="dev-card-deck-hint">
        <p className="hint" style={{ margin: 0 }}>
          Pioche restante : <strong>{gameState.devCardDeckRemaining}</strong>
        </p>
        <span className="hint">
          Coût : {DEV_CARD_COST.mouton} 🐑 + {DEV_CARD_COST.ble} 🌾 + {DEV_CARD_COST.minerai} ⛏️
        </span>
      </div>

      <button onClick={handleBuy} disabled={!canBuy} className="primary">
        🛒 Acheter une carte
      </button>

      {entries.length === 0 && <p className="hint">Vous ne possédez aucune carte développement.</p>}

      <ul className="dev-card-list">
        {entries.map(([type, info]) => (
          <li key={type} className="dev-card-item">
            <div className="dev-card-item-title">
              <span>{DEV_CARD_LABELS[type]?.icon}</span>
              <strong>{DEV_CARD_LABELS[type]?.label || type}</strong>
              <span className="hint">— {info.total} en main</span>
              {type !== 'victoire' && info.playable < info.total && (
                <span className="hint">({info.total - info.playable} pas encore jouable)</span>
              )}
            </div>
            <div className="hint">{DEV_CARD_LABELS[type]?.hint}</div>

            {type === 'route' && info.playable > 0 && (
              <button disabled={!canPlayAny} onClick={() => handlePlaySimple('route')}>
                Jouer
              </button>
            )}

            {type === 'invention' && info.playable > 0 && (
              <>
                <button disabled={!canPlayAny} onClick={handleStartInvention}>
                  Jouer
                </button>
                {activeAction === 'invention' && (
                  <div className="dev-card-picker">
                    {[0, 1].map((i) => (
                      <select
                        key={i}
                        value={inventionPicks[i]}
                        onChange={(e) => {
                          const next = [...inventionPicks];
                          next[i] = e.target.value;
                          setInventionPicks(next);
                        }}
                      >
                        {Object.entries(RESOURCE_LABELS).map(([r, meta]) => (
                          <option key={r} value={r}>
                            {meta.label}
                          </option>
                        ))}
                      </select>
                    ))}
                    <button onClick={handleConfirmInvention} className="primary">
                      Confirmer
                    </button>
                    <button onClick={() => setActiveAction(null)}>Annuler</button>
                  </div>
                )}
              </>
            )}

            {type === 'monopole' && info.playable > 0 && (
              <>
                <button disabled={!canPlayAny} onClick={handleStartMonopole}>
                  Jouer
                </button>
                {activeAction === 'monopole' && (
                  <div className="dev-card-picker">
                    <select value={monopoleResource} onChange={(e) => setMonopoleResource(e.target.value)}>
                      {Object.entries(RESOURCE_LABELS).map(([r, meta]) => (
                        <option key={r} value={r}>
                          {meta.label}
                        </option>
                      ))}
                    </select>
                    <button onClick={handleConfirmMonopole} className="primary">
                      Confirmer
                    </button>
                    <button onClick={() => setActiveAction(null)}>Annuler</button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
