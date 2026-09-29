import React from 'react';

const RESOURCE_LABELS = {
  bois: { label: 'Bois', icon: '🪵' },
  argile: { label: 'Argile', icon: '🧱' },
  mouton: { label: 'Mouton', icon: '🐑' },
  ble: { label: 'Blé', icon: '🌾' },
  minerai: { label: 'Minerai', icon: '⛏️' }
};

export default function PlayerResources({ player }) {
  if (!player) return null;
  return (
    <div className="panel player-resources">
      <h3>📦 Vos ressources</h3>
      <div className="resource-grid">
        {Object.entries(RESOURCE_LABELS).map(([key, meta]) => (
          <div key={key} className="resource-tile">
            <span className="resource-icon">{meta.icon}</span>
            <span className="resource-label">{meta.label}</span>
            <span className="resource-count">{player.resources[key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { RESOURCE_LABELS };
