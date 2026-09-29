import React, { useState } from 'react';
import { socket } from '../socket.js';
import { RESOURCE_LABELS } from './PlayerResources.jsx';
import { BANK_TRADE_RATE } from '../buildCosts.js';

const RESOURCE_KEYS = Object.keys(RESOURCE_LABELS);

function emptyAmounts() {
  const amounts = {};
  RESOURCE_KEYS.forEach((r) => (amounts[r] = 0));
  return amounts;
}

export default function TradePanel({ gameState, myId, isMyTurn }) {
  const [offering, setOffering] = useState(emptyAmounts);
  const [requesting, setRequesting] = useState(emptyAmounts);
  const [bankGive, setBankGive] = useState('bois');
  const [bankReceive, setBankReceive] = useState('argile');
  const [dismissedTradeId, setDismissedTradeId] = useState(null);

  const canAct = isMyTurn && gameState.phase === 'build';
  const trade = gameState.pendingTrade;
  const isProposer = trade && trade.fromPlayerId === myId;

  function updateAmount(setter, resource, value) {
    const n = Math.max(0, Math.min(9, Number(value) || 0));
    setter((prev) => ({ ...prev, [resource]: n }));
  }

  function handlePropose() {
    socket.emit('propose_trade', { offering, requesting });
    setOffering(emptyAmounts());
    setRequesting(emptyAmounts());
  }

  function handleCancel() {
    socket.emit('cancel_trade');
  }

  function handleAccept() {
    socket.emit('accept_trade', { tradeId: trade.id });
  }

  function handleBankTrade() {
    socket.emit('bank_trade', { give: bankGive, receive: bankReceive });
  }

  function describeAmounts(amounts) {
    const parts = RESOURCE_KEYS.filter((r) => amounts[r] > 0).map(
      (r) => `${amounts[r]} ${RESOURCE_LABELS[r].label.toLowerCase()}`
    );
    return parts.length > 0 ? parts.join(', ') : 'rien';
  }

  return (
    <div className="panel trade-panel">
      <h3>🔄 Échanges</h3>

      {trade && trade.id !== dismissedTradeId && (
        <div className="pending-trade">
          <p>
            🤝 <strong>{gameState.players[trade.fromPlayerId]?.name}</strong> propose : {describeAmounts(trade.offering)}{' '}
            contre {describeAmounts(trade.requesting)}.
          </p>
          {isProposer ? (
            <button onClick={handleCancel} className="danger">
              Annuler mon offre
            </button>
          ) : (
            <>
              <button onClick={handleAccept} className="primary">
                ✅ Accepter
              </button>
              <button onClick={() => setDismissedTradeId(trade.id)}>Ignorer</button>
            </>
          )}
        </div>
      )}

      {canAct && !trade && (
        <div className="trade-form">
          <p className="hint">Proposez un échange aux autres joueurs.</p>
          <div className="trade-columns">
            <div>
              <strong>Je propose</strong>
              {RESOURCE_KEYS.map((r) => (
                <label key={r} className="trade-row">
                  {RESOURCE_LABELS[r].icon} {RESOURCE_LABELS[r].label}
                  <input
                    type="number"
                    min="0"
                    max="9"
                    value={offering[r]}
                    onChange={(e) => updateAmount(setOffering, r, e.target.value)}
                  />
                </label>
              ))}
            </div>
            <div>
              <strong>Je demande</strong>
              {RESOURCE_KEYS.map((r) => (
                <label key={r} className="trade-row">
                  {RESOURCE_LABELS[r].icon} {RESOURCE_LABELS[r].label}
                  <input
                    type="number"
                    min="0"
                    max="9"
                    value={requesting[r]}
                    onChange={(e) => updateAmount(setRequesting, r, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>
          <button onClick={handlePropose} className="primary">
            🤝 Proposer l'échange
          </button>
        </div>
      )}

      {canAct && (
        <div className="bank-trade-form">
          <strong>🏦 Échange avec la banque ({BANK_TRADE_RATE} contre 1)</strong>
          <div className="trade-row">
            <select value={bankGive} onChange={(e) => setBankGive(e.target.value)}>
              {RESOURCE_KEYS.map((r) => (
                <option key={r} value={r}>
                  {RESOURCE_LABELS[r].icon} {RESOURCE_LABELS[r].label}
                </option>
              ))}
            </select>
            →
            <select value={bankReceive} onChange={(e) => setBankReceive(e.target.value)}>
              {RESOURCE_KEYS.map((r) => (
                <option key={r} value={r}>
                  {RESOURCE_LABELS[r].icon} {RESOURCE_LABELS[r].label}
                </option>
              ))}
            </select>
            <button onClick={handleBankTrade}>Échanger</button>
          </div>
        </div>
      )}
    </div>
  );
}
