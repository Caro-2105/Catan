import React, { useEffect, useRef } from 'react';

export default function GameLog({ log }) {
  // On garde le journal scrollé tout en bas à chaque nouvel événement, mais
  // uniquement à l'intérieur de sa propre liste (scrollTop), jamais avec
  // scrollIntoView : ce dernier peut faire défiler des ancêtres jusqu'à la
  // page entière, ce qui faisait "redescendre" toute la fenêtre à chaque
  // mise à jour de l'état reçue par websocket (très fréquent en partie).
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [log]);

  return (
    <div className="panel game-log">
      <h3>📜 Journal de partie</h3>
      <ul ref={listRef}>
        {log.map((entry, i) => (
          <li key={i}>{entry.message}</li>
        ))}
      </ul>
    </div>
  );
}
