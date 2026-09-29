import React, { useEffect, useState } from 'react';
import { socket } from './socket.js';
import Header from './components/Header.jsx';
import Lobby from './components/Lobby.jsx';
import GameBoard from './components/GameBoard.jsx';
import PlayerResources, { RESOURCE_LABELS } from './components/PlayerResources.jsx';
import DiceRoller from './components/DiceRoller.jsx';
import GameLog from './components/GameLog.jsx';
import PlayersList from './components/PlayersList.jsx';
import DevCards from './components/DevCards.jsx';
import TradePanel from './components/TradePanel.jsx';
import VictoryOverlay from './components/VictoryOverlay.jsx';
import { BUILD_COSTS } from './buildCosts.js';

// Petite rangée de puces "icône ressource + quantité requise", utilisée sur
// les boutons de construction pour qu'on voie le coût d'un coup d'œil.
function CostChips({ cost }) {
  return (
    <span className="cost-chips">
      {Object.entries(cost).map(([resource, amount]) => (
        <span key={resource} className="cost-chip">
          {RESOURCE_LABELS[resource].icon} {amount}
        </span>
      ))}
    </span>
  );
}

function canAfford(resources, cost) {
  if (!resources) return false;
  return Object.entries(cost).every(([resource, amount]) => (resources[resource] || 0) >= amount);
}

export default function App() {
  const [gameState, setGameState] = useState(null);
  const [myId, setMyId] = useState(socket.id || null);
  const [connected, setConnected] = useState(socket.connected);
  const [errorMessage, setErrorMessage] = useState('');
  const [buildMode, setBuildMode] = useState(null); // null | 'route' | 'colonie' | 'ville' — uniquement pour la phase de jeu normale

  useEffect(() => {
    function handleConnect() {
      setConnected(true);
      setMyId(socket.id);
    }
    function handleDisconnect() {
      setConnected(false);
    }
    function handleGameState(state) {
      setGameState(state);
    }
    function handleError(message) {
      setErrorMessage(message);
      // Efface le message d'erreur après quelques secondes.
      setTimeout(() => setErrorMessage(''), 4000);
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('game_state', handleGameState);
    socket.on('error_message', handleError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('game_state', handleGameState);
      socket.off('error_message', handleError);
    };
  }, []);

  if (!connected || !gameState) {
    return (
      <div className="app-shell">
        <Header gameState={gameState} myId={myId} />
        <p className="hint">Connexion au serveur...</p>
      </div>
    );
  }

  if (gameState.status === 'lobby') {
    return (
      <div className="app-shell">
        <Header gameState={gameState} myId={myId} />
        <Lobby gameState={gameState} myId={myId} errorMessage={errorMessage} />
      </div>
    );
  }

  const me = gameState.players[myId];
  const isMyTurn = gameState.currentPlayerId === myId;
  const isSetup = gameState.status === 'setup';
  const isFinished = gameState.status === 'finished';
  const canAct = isMyTurn && !isFinished; // gèle tous les boutons d'action une fois la partie terminée

  function handleEndTurn() {
    socket.emit('end_turn');
  }

  function handleNewGame() {
    socket.emit('new_game');
  }

  function toggleBuildMode(mode) {
    setBuildMode((current) => (current === mode ? null : mode));
  }

  // --- Détermine ce qui est cliquable sur le plateau et ce qui se passe au clic ---
  let activeMode = null;
  let onVertexActivate = () => {};
  let onEdgeActivate = () => {};
  let instructions = '';

  if (isFinished) {
    instructions = 'La partie est terminée.';
  } else if (isSetup) {
    if (isMyTurn) {
      activeMode = gameState.setup.step === 'settlement' ? 'vertex' : 'edge';
      onVertexActivate = (vertexId) => socket.emit('setup_place_settlement', { vertexId });
      onEdgeActivate = (edgeId) => socket.emit('setup_place_road', { edgeId });
      instructions =
        gameState.setup.step === 'settlement'
          ? `Cliquez sur une intersection libre pour placer votre ${
              gameState.setup.placementNumber === 1 ? '1ère' : '2ème'
            } colonie.`
          : 'Cliquez sur un segment libre relié à votre colonie pour placer votre route.';
    } else {
      instructions = `En attente du placement de ${gameState.players[gameState.currentPlayerId]?.name || '...'}.`;
    }
  } else if (isMyTurn && gameState.freeRoadsRemaining > 0) {
    // Carte "Construction de route" en cours : priorité sur le mode de
    // construction manuel tant qu'il reste des routes gratuites à placer.
    activeMode = 'edge';
    onEdgeActivate = (edgeId) => socket.emit('build_free_road', { edgeId });
    instructions = `Carte Construction de route : placez ${gameState.freeRoadsRemaining} route(s) gratuite(s) supplémentaire(s).`;
  } else {
    activeMode =
      buildMode === 'route' ? 'edge' : buildMode === 'colonie' ? 'vertex' : buildMode === 'ville' ? 'vertex-upgrade' : null;
    onVertexActivate = (vertexId) => {
      const event = buildMode === 'ville' ? 'build_city' : 'build_settlement';
      socket.emit(event, { vertexId });
      setBuildMode(null);
    };
    onEdgeActivate = (edgeId) => {
      socket.emit('build_road', { edgeId });
      setBuildMode(null);
    };
    if (buildMode === 'route') instructions = 'Cliquez sur un segment libre du plateau pour y construire une route.';
    if (buildMode === 'colonie') instructions = 'Cliquez sur une intersection libre du plateau pour y construire une colonie.';
    if (buildMode === 'ville') instructions = 'Cliquez sur une de vos colonies pour l\'améliorer en ville.';
  }

  return (
    <div className="app-shell">
      <Header gameState={gameState} myId={myId} />
      {errorMessage && <p className="error floating-error">⚠️ {errorMessage}</p>}
      {isFinished && <VictoryOverlay gameState={gameState} myId={myId} onNewGame={handleNewGame} />}

      {isSetup && (
        <div className="panel setup-banner">
          <h3>🛠️ Mise en place</h3>
          <p>
            {isMyTurn
              ? `À vous de jouer : placez votre ${gameState.setup.placementNumber === 1 ? '1ère' : '2ème'} colonie${
                  gameState.setup.step === 'road' ? ' puis sa route' : ''
                }.`
              : `En attente de ${gameState.players[gameState.currentPlayerId]?.name || '...'}...`}
          </p>
          {gameState.setup.placementNumber === 2 && (
            <p className="hint">La 2ème colonie de chaque joueur rapporte immédiatement ses ressources de départ.</p>
          )}
        </div>
      )}

      <div className="game-layout">
        <div className="left-column">
          <GameBoard
            gameState={gameState}
            activeMode={activeMode}
            onVertexActivate={onVertexActivate}
            onEdgeActivate={onEdgeActivate}
            instructions={instructions}
            myId={myId}
          />
        </div>

        <div className="right-column">
          <PlayersList gameState={gameState} myId={myId} />

          {!isSetup && (
            <>
              <DiceRoller isMyTurn={canAct} phase={gameState.phase} lastDiceRoll={gameState.lastDiceRoll} />
              <PlayerResources player={me} />

              <div className="panel build-controls">
                <h3>🏗️ Construire</h3>
                {(() => {
                  const baseBlocked = !canAct || gameState.phase !== 'build' || gameState.freeRoadsRemaining > 0;
                  const hasUpgradeableSettlement = (me.settlements.length || 0) - (me.cities.length || 0) > 0;
                  return (
                    <>
                      <button
                        disabled={baseBlocked || !canAfford(me.resources, BUILD_COSTS.route)}
                        className={`build-btn route${buildMode === 'route' ? ' active' : ''}`}
                        onClick={() => toggleBuildMode('route')}
                        title="Doit être reliée à une de vos routes ou colonies"
                      >
                        <span className="build-btn-title">🛤️ Route</span>
                        <CostChips cost={BUILD_COSTS.route} />
                      </button>
                      <button
                        disabled={baseBlocked || !canAfford(me.resources, BUILD_COSTS.colonie)}
                        className={`build-btn colonie${buildMode === 'colonie' ? ' active' : ''}`}
                        onClick={() => toggleBuildMode('colonie')}
                        title="Doit être reliée à une de vos routes, à distance d'une autre colonie"
                      >
                        <span className="build-btn-title">🏠 Colonie</span>
                        <CostChips cost={BUILD_COSTS.colonie} />
                      </button>
                      <button
                        disabled={baseBlocked || !hasUpgradeableSettlement || !canAfford(me.resources, BUILD_COSTS.ville)}
                        className={`build-btn ville${buildMode === 'ville' ? ' active' : ''}`}
                        onClick={() => toggleBuildMode('ville')}
                        title={hasUpgradeableSettlement ? 'Améliore une de vos colonies existantes' : 'Il vous faut une colonie à améliorer'}
                      >
                        <span className="build-btn-title">🏰 Ville</span>
                        <CostChips cost={BUILD_COSTS.ville} />
                      </button>
                    </>
                  );
                })()}
                <button
                  disabled={!canAct || gameState.phase !== 'build' || gameState.freeRoadsRemaining > 0}
                  onClick={handleEndTurn}
                  className="primary"
                >
                  ✅ Terminer mon tour
                </button>
                {canAct && gameState.freeRoadsRemaining > 0 && (
                  <p className="hint">🎁 Placez vos routes gratuites avant de continuer.</p>
                )}
              </div>

              <DevCards gameState={gameState} myId={myId} isMyTurn={canAct} />
              <TradePanel gameState={gameState} myId={myId} isMyTurn={canAct} />
            </>
          )}

          {isSetup && <PlayerResources player={me} />}

          <GameLog log={gameState.log} />
        </div>
      </div>
    </div>
  );
}
