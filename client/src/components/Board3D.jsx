import React, { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';

// ---------------------------------------------------------------------------
// Plateau 3D navigable : mêmes données de jeu que GameBoard.jsx (board.tiles /
// board.vertices / board.edges), mais rendu en 3D avec une vraie géométrie de
// terrain (montagnes, forêts, champs, collines, pâturages) et des pièces en
// volume (colonies, villes, routes) au lieu du SVG plat. La topologie
// (positions x/y des sommets, générées côté serveur) reste la source de
// vérité unique : on convertit ces coordonnées 2D en positions 3D (x, 0, z)
// via un simple facteur d'échelle, ce qui garantit que les tuiles, sommets et
// arêtes s'alignent parfaitement entre eux, exactement comme dans la version
// SVG.
// ---------------------------------------------------------------------------

const SCALE = 1 / 30; // pixels (serveur) -> unités monde (Three.js)
const TILE_THICKNESS = 0.42;

const RESOURCE_COLORS = {
  bois: '#3a7a4e',
  argile: '#b5652f',
  mouton: '#8fd0a0',
  ble: '#e3b93a',
  minerai: '#7c8a99',
  desert: '#d9c08a'
};

const RESOURCE_SHORT = {
  bois: 'Bois',
  argile: 'Argile',
  mouton: 'Mouton',
  ble: 'Blé',
  minerai: 'Minerai',
  desert: 'Désert'
};

const RESOURCE_ICONS = {
  bois: '🪵',
  argile: '🧱',
  mouton: '🐑',
  ble: '🌾',
  minerai: '⛏️',
  desert: '🏜️'
};

// --- RNG déterministe (seedé par l'id de tuile) pour répartir les décors de
// façon stable : sans ça, un re-rendu recalculerait des positions aléatoires
// différentes à chaque frame et les arbres/rochers "sauteraient".
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Construit un prisme hexagonal à partir des coins RÉELS du plateau (déjà
// calculés côté serveur), avec des normales explicites par face plutôt que
// calculées depuis l'ordre des sommets : ça évite tout bug d'éclairage ou de
// face invisible si l'ordre de balayage des coins ne correspond pas à la
// convention habituelle de Three.js.
function buildHexPrismGeometry(cornersRel, thickness) {
  const topY = 0;
  const botY = -thickness;
  const n = cornersRel.length;
  const positions = [];
  const normals = [];

  function addTri(p0, p1, p2, normal) {
    [p0, p1, p2].forEach((p) => {
      positions.push(p[0], p[1], p[2]);
      normals.push(normal[0], normal[1], normal[2]);
    });
  }

  const topCenter = [0, topY, 0];
  for (let i = 0; i < n; i++) {
    const a = [cornersRel[i].x, topY, cornersRel[i].z];
    const b = [cornersRel[(i + 1) % n].x, topY, cornersRel[(i + 1) % n].z];
    addTri(topCenter, a, b, [0, 1, 0]);
  }

  const botCenter = [0, botY, 0];
  for (let i = 0; i < n; i++) {
    const a = [cornersRel[i].x, botY, cornersRel[i].z];
    const b = [cornersRel[(i + 1) % n].x, botY, cornersRel[(i + 1) % n].z];
    addTri(botCenter, b, a, [0, -1, 0]);
  }

  for (let i = 0; i < n; i++) {
    const c1 = cornersRel[i];
    const c2 = cornersRel[(i + 1) % n];
    const mid = { x: (c1.x + c2.x) / 2, z: (c1.z + c2.z) / 2 };
    const len = Math.hypot(mid.x, mid.z) || 1;
    const normal = [mid.x / len, 0, mid.z / len];
    const t1 = [c1.x, topY, c1.z];
    const t2 = [c2.x, topY, c2.z];
    const b1 = [c1.x, botY, c1.z];
    const b2 = [c2.x, botY, c2.z];
    addTri(t1, b1, t2, normal);
    addTri(t2, b1, b2, normal);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geo;
}

// --- Petits éléments de décor (bas-poly, aucune texture/asset externe) -----

function Tree({ position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.09, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.03, 0.18, 6]} />
        <meshStandardMaterial color="#6b4423" />
      </mesh>
      <mesh position={[0, 0.24, 0]} castShadow>
        <coneGeometry args={[0.13, 0.32, 7]} />
        <meshStandardMaterial color="#2f6b3f" />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <coneGeometry args={[0.09, 0.22, 7]} />
        <meshStandardMaterial color="#3a7a4e" />
      </mesh>
    </group>
  );
}

function Mountain({ position, height, radius }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <coneGeometry args={[radius, height, 5]} />
      <meshStandardMaterial color="#8b95a3" flatShading />
    </mesh>
  );
}

function HillBump({ position, radius }) {
  return (
    <mesh position={position} scale={[1, 0.55, 1]} castShadow>
      <sphereGeometry args={[radius, 8, 6]} />
      <meshStandardMaterial color="#a8623a" flatShading />
    </mesh>
  );
}

function WheatTuft({ position }) {
  return (
    <mesh position={position} castShadow>
      <coneGeometry args={[0.05, 0.22, 5]} />
      <meshStandardMaterial color="#f0c948" />
    </mesh>
  );
}

function Sheep({ position }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <sphereGeometry args={[0.08, 8, 6]} />
        <meshStandardMaterial color="#fdfaf3" />
      </mesh>
      <mesh position={[0.08, -0.01, 0]} castShadow>
        <sphereGeometry args={[0.045, 6, 6]} />
        <meshStandardMaterial color="#4a3a2a" />
      </mesh>
    </group>
  );
}

function DesertRock({ position, scale }) {
  return (
    <mesh position={position} scale={scale} castShadow>
      <dodecahedronGeometry args={[0.14, 0]} />
      <meshStandardMaterial color="#c9a86a" flatShading />
    </mesh>
  );
}

function TerrainDecor({ tile }) {
  const items = useMemo(() => {
    const list = [];
    const rand = mulberry32(hashStr(tile.id));
    const jitter = (r = 0.9) => (rand() - 0.5) * 2 * r;
    switch (tile.resource) {
      case 'bois':
        for (let i = 0; i < 6; i++) {
          list.push({ type: 'tree', x: jitter(1.0), z: jitter(1.0), scale: 0.8 + rand() * 0.5 });
        }
        break;
      case 'minerai':
        list.push({ type: 'mountain', x: -0.3, z: 0.1, height: 1.0, radius: 0.5 });
        list.push({ type: 'mountain', x: 0.35, z: -0.2, height: 0.75, radius: 0.4 });
        list.push({ type: 'mountain', x: 0.05, z: 0.45, height: 0.55, radius: 0.32 });
        break;
      case 'argile':
        for (let i = 0; i < 4; i++) {
          list.push({ type: 'hill', x: jitter(0.9), z: jitter(0.9), radius: 0.22 + rand() * 0.12 });
        }
        break;
      case 'ble':
        for (let i = 0; i < 8; i++) {
          list.push({ type: 'wheat', x: jitter(1.0), z: jitter(1.0) });
        }
        break;
      case 'mouton':
        for (let i = 0; i < 4; i++) {
          list.push({ type: 'sheep', x: jitter(0.9), z: jitter(0.9) });
        }
        break;
      case 'desert':
        for (let i = 0; i < 3; i++) {
          list.push({ type: 'rock', x: jitter(0.8), z: jitter(0.8), scale: 0.6 + rand() * 0.6 });
        }
        break;
      default:
        break;
    }
    return list;
  }, [tile.id, tile.resource]);

  return (
    <group>
      {items.map((it, i) => {
        if (it.type === 'tree') return <Tree key={i} position={[it.x, 0, it.z]} scale={it.scale} />;
        if (it.type === 'mountain')
          return (
            <Mountain key={i} position={[it.x, it.height / 2, it.z]} height={it.height} radius={it.radius} />
          );
        if (it.type === 'hill') return <HillBump key={i} position={[it.x, 0.05, it.z]} radius={it.radius} />;
        if (it.type === 'wheat') return <WheatTuft key={i} position={[it.x, 0.11, it.z]} />;
        if (it.type === 'sheep') return <Sheep key={i} position={[it.x, 0.08, it.z]} />;
        if (it.type === 'rock') return <DesertRock key={i} position={[it.x, 0.06, it.z]} scale={it.scale} />;
        return null;
      })}
    </group>
  );
}

function Tile3D({ tile, board }) {
  const geometry = useMemo(() => {
    const corners = tile.vertexIds.map((vid) => board.vertices[vid]);
    const cornersRel = corners.map((c) => ({
      x: (c.x - tile.x) * SCALE,
      z: (c.y - tile.y) * SCALE
    }));
    return buildHexPrismGeometry(cornersRel, TILE_THICKNESS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tile.id]);

  const color = RESOURCE_COLORS[tile.resource];
  const isHot = tile.number === 6 || tile.number === 8;

  return (
    <group position={[tile.x * SCALE, 0, tile.y * SCALE]}>
      <mesh geometry={geometry} receiveShadow castShadow>
        <meshStandardMaterial color={color} side={THREE.DoubleSide} />
      </mesh>
      <TerrainDecor tile={tile} />
      {tile.number !== null && (
        <Html position={[0, 0.55, 0]} center occlude={false}>
          <div className={`token3d${isHot ? ' hot' : ''}`}>{tile.number}</div>
        </Html>
      )}
      {tile.resource === 'desert' && (
        <Html position={[0, 0.35, 0]} center occlude={false}>
          <div className="token3d desert-label">🏜️</div>
        </Html>
      )}
    </group>
  );
}

// --- Pièces des joueurs -----------------------------------------------------

function Settlement3D({ color }) {
  return (
    <group>
      <mesh position={[0, 0.09, 0]} castShadow>
        <boxGeometry args={[0.22, 0.18, 0.22]} />
        <meshStandardMaterial color="#fdf6e3" />
      </mesh>
      <mesh position={[0, 0.2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.18, 0.16, 4]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function City3D({ color }) {
  return (
    <group>
      <mesh position={[0, 0.15, 0]} castShadow>
        <boxGeometry args={[0.26, 0.3, 0.26]} />
        <meshStandardMaterial color="#f0ead6" />
      </mesh>
      <mesh position={[0, 0.34, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.22, 0.18, 4]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.22, 0.1, 0.05]} castShadow>
        <boxGeometry args={[0.16, 0.2, 0.16]} />
        <meshStandardMaterial color="#f0ead6" />
      </mesh>
      <mesh position={[0.22, 0.22, 0.05]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.13, 0.12, 4]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function PulseRing({ color }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const s = 1 + Math.sin(t * 3) * 0.15;
    ref.current.scale.set(s, s, s);
    if (ref.current.material) {
      ref.current.material.opacity = 0.55 + Math.sin(t * 3) * 0.25;
    }
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <ringGeometry args={[0.14, 0.19, 24]} />
      <meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function VertexMarker3D({ vertex, owner, isCity, clickable, clickableToUpgrade, onActivate }) {
  const [hovered, setHovered] = useState(false);
  const pos = [vertex.x * SCALE, 0, vertex.y * SCALE];

  function handleClick(e) {
    if (!clickable) return;
    e.stopPropagation();
    onActivate(vertex.id);
  }
  function handleOver(e) {
    if (!clickable) return;
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = 'pointer';
  }
  function handleOut() {
    setHovered(false);
    document.body.style.cursor = 'auto';
  }

  return (
    <group position={pos}>
      <mesh visible={false} onClick={handleClick} onPointerOver={handleOver} onPointerOut={handleOut}>
        <sphereGeometry args={[0.3, 8, 8]} />
        <meshBasicMaterial />
      </mesh>

      {owner ? (
        isCity ? (
          <City3D color={owner.color} />
        ) : (
          <Settlement3D color={owner.color} />
        )
      ) : (
        <mesh>
          <sphereGeometry args={[clickable ? 0.09 : 0.05, 10, 10]} />
          <meshStandardMaterial
            color={clickable ? (hovered ? '#c8971f' : '#ffffff') : '#8a8072'}
            emissive={clickable ? '#c8971f' : '#000000'}
            emissiveIntensity={clickable ? (hovered ? 0.7 : 0.3) : 0}
          />
        </mesh>
      )}

      {clickable && <PulseRing color={clickableToUpgrade ? '#c8971f' : '#1f7a74'} />}
    </group>
  );
}

function EdgeMarker3D({ edge, board, owner, clickable, onActivate }) {
  const [hovered, setHovered] = useState(false);
  const v1 = board.vertices[edge.v1];
  const v2 = board.vertices[edge.v2];
  const x1 = v1.x * SCALE;
  const z1 = v1.y * SCALE;
  const x2 = v2.x * SCALE;
  const z2 = v2.y * SCALE;
  const mx = (x1 + x2) / 2;
  const mz = (z1 + z2) / 2;
  const length = Math.hypot(x2 - x1, z2 - z1);
  const angle = Math.atan2(z2 - z1, x2 - x1);

  function handleClick(e) {
    if (!clickable) return;
    e.stopPropagation();
    onActivate(edge.id);
  }
  function handleOver(e) {
    if (!clickable) return;
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = 'pointer';
  }
  function handleOut() {
    setHovered(false);
    document.body.style.cursor = 'auto';
  }

  return (
    <group position={[mx, 0, mz]} rotation={[0, -angle, 0]}>
      <mesh visible={false} onClick={handleClick} onPointerOver={handleOver} onPointerOut={handleOut}>
        <boxGeometry args={[length, 0.3, 0.28]} />
        <meshBasicMaterial />
      </mesh>

      {owner ? (
        <mesh position={[0, 0.04, 0]} castShadow>
          <boxGeometry args={[length * 0.82, 0.06, 0.11]} />
          <meshStandardMaterial color={owner.color} />
        </mesh>
      ) : clickable ? (
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[length * 0.82, 0.02, 0.09]} />
          <meshStandardMaterial
            color={hovered ? '#c8971f' : '#ffffff'}
            transparent
            opacity={hovered ? 0.9 : 0.55}
            emissive={hovered ? '#c8971f' : '#1f7a74'}
            emissiveIntensity={0.4}
          />
        </mesh>
      ) : null}
    </group>
  );
}

function SeaPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
      <circleGeometry args={[16, 48]} />
      <meshStandardMaterial color="#2a8f89" />
    </mesh>
  );
}

// activeMode : null | 'vertex' | 'edge' | 'vertex-upgrade' — identique à la
// version SVG (voir GameBoard.jsx) : App.jsx décide quel mode est actif et
// quel événement socket émettre, ce composant ne fait que rendre le plateau
// et exposer les clics.
export default function Board3D({ gameState, activeMode, onVertexActivate, onEdgeActivate, instructions, myId }) {
  const { board, players, playerOrder } = gameState;

  const { roadOwnerByEdge, settlementOwnerByVertex, cityOwnerByVertex } = useMemo(() => {
    const roadOwnerByEdge = {};
    const settlementOwnerByVertex = {};
    const cityOwnerByVertex = {};
    playerOrder.forEach((pid) => {
      const p = players[pid];
      p.roads.forEach((edgeId) => (roadOwnerByEdge[edgeId] = p));
      p.settlements.forEach((vertexId) => (settlementOwnerByVertex[vertexId] = p));
      (p.cities || []).forEach((vertexId) => (cityOwnerByVertex[vertexId] = p));
    });
    return { roadOwnerByEdge, settlementOwnerByVertex, cityOwnerByVertex };
  }, [players, playerOrder]);

  function handleVertexClick(vertexId) {
    if (activeMode !== 'vertex' && activeMode !== 'vertex-upgrade') return;
    onVertexActivate(vertexId);
  }
  function handleEdgeClick(edgeId) {
    if (activeMode !== 'edge') return;
    onEdgeActivate(edgeId);
  }

  return (
    <div className="panel game-board">
      <h3>🗺️ Plateau (3D)</h3>
      <div className="board-frame board-frame-3d">
        <Canvas shadows camera={{ position: [0, 13, 16], fov: 45 }}>
          <color attach="background" args={['#bfe3f0']} />
          <fog attach="fog" args={['#bfe3f0', 24, 44]} />
          <ambientLight intensity={0.9} />
          <hemisphereLight args={['#eaf6ff', '#3a5a40', 1.6]} />
          <directionalLight
            castShadow
            position={[6, 10, 4]}
            intensity={3.4}
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-left={-14}
            shadow-camera-right={14}
            shadow-camera-top={14}
            shadow-camera-bottom={-14}
          />
          <directionalLight position={[-8, 6, -6]} intensity={0.8} />

          <SeaPlane />

          {board.tiles.map((tile) => (
            <Tile3D key={tile.id} tile={tile} board={board} />
          ))}

          {Object.values(board.edges).map((edge) => (
            <EdgeMarker3D
              key={edge.id}
              edge={edge}
              board={board}
              owner={roadOwnerByEdge[edge.id]}
              clickable={activeMode === 'edge' && !roadOwnerByEdge[edge.id]}
              onActivate={handleEdgeClick}
            />
          ))}

          {Object.values(board.vertices).map((vertex) => {
            const owner = settlementOwnerByVertex[vertex.id];
            const isCity = Boolean(cityOwnerByVertex[vertex.id]);
            const clickableToBuild = activeMode === 'vertex' && !owner;
            const clickableToUpgrade =
              activeMode === 'vertex-upgrade' && owner && owner.id === myId && !isCity;
            const clickable = clickableToBuild || clickableToUpgrade;
            return (
              <VertexMarker3D
                key={vertex.id}
                vertex={vertex}
                owner={owner}
                isCity={isCity}
                clickable={clickable}
                clickableToUpgrade={clickableToUpgrade}
                onActivate={handleVertexClick}
              />
            );
          })}

          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            enablePan
            minDistance={6}
            maxDistance={28}
            maxPolarAngle={Math.PI / 2.15}
            target={[0, 0, 0]}
          />
        </Canvas>
      </div>

      <p className="hint board-nav-hint">
        🧭 Clic-glisser pour tourner autour du plateau, molette pour zoomer, clic droit (ou deux doigts) pour déplacer la vue.
      </p>

      <div className="board-legend">
        {Object.entries(RESOURCE_SHORT).map(([key, label]) => (
          <span key={key} className="board-legend-item">
            <span className="board-legend-swatch" style={{ background: RESOURCE_COLORS[key] }} />
            {RESOURCE_ICONS[key]} {label}
          </span>
        ))}
      </div>

      {instructions && <p className="hint build-hint">💡 {instructions}</p>}
    </div>
  );
}
