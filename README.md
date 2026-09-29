# Catan MVP — version numérique simplifiée

Version en ligne, jouable à 2-4 joueurs dans un navigateur, du jeu de
plateau Catan avec des règles volontairement simplifiées pour aller vite :
**pas de voleur/règle du 7, pas de Chevalier, pas de ports**. L'accent est
mis sur la synchronisation temps réel de l'état de partie entre les joueurs
via Socket.io.

## Stack

- **Backend** : Node.js + Express + Socket.io (`server/`)
- **Frontend** : React + Vite + socket.io-client (`client/`)
- Une seule partie globale en mémoire (pas de base de données, pas de
  système de "rooms" séparées) : pensé pour un petit groupe d'amis qui
  jouent ensemble.

## Démarrage rapide

Deux terminaux sont nécessaires (serveur + client).

### 1. Serveur

```bash
cd server
npm install
npm start
# écoute par défaut sur http://localhost:4000
```

### 2. Client

```bash
cd client
npm install
npm run dev
# ouvre http://localhost:5173
```

> `npm install` télécharge aussi les dépendances du plateau 3D (`three`,
> `@react-three/fiber`, `@react-three/drei`) — un peu plus long la première
> fois, rien à faire de spécial ensuite.

Ouvrez `http://localhost:5173` dans plusieurs onglets/navigateurs (un par
joueur), donnez un prénom à chacun, puis lancez la partie une fois au moins
2 joueurs connectés (jusqu'à 4).

Pour jouer entre plusieurs machines sur le même réseau, ajustez :
- côté client : la variable d'env Vite `VITE_SERVER_URL` (voir
  `client/src/socket.js`) pour pointer vers l'IP/le port du serveur.
- côté serveur : la variable d'env `CLIENT_ORIGIN` pour restreindre le CORS
  à l'origine réelle du client en production.

## Règles implémentées (MVP)

1. **Plateau en 3D navigable** : 19 tuiles hexagonales générées à chaque
   partie (layout classique Catan : 4 forêts, 3 collines, 4 pâturages, 4
   champs, 3 montagnes, 1 désert), jetons numérotés de 2 à 12 (jamais 7,
   puisqu'il n'y a pas de voleur), rendu en 3D (Three.js / React Three
   Fiber) avec un vrai relief par ressource (pics rocheux sur les
   montagnes, arbres sur les forêts, moutons sur les pâturages, épis sur
   les champs, buttes d'argile sur les collines) et une caméra libre
   (clic-glisser pour tourner, molette pour zoomer, clic droit pour
   déplacer la vue). Colonies, villes et routes sont de vraies pièces en
   volume (maisons/tours miniatures) plutôt que des formes plates. Voir
   la section "Plateau 3D" plus bas pour le détail technique.
2. **Mise en place interactive** : chaque joueur choisit lui-même
   l'emplacement de ses 2 colonies et 2 routes de départ, en cliquant sur le
   plateau, dans l'ordre "en serpent" classique de Catan (J1, J2, J3, puis
   J3, J2, J1 pour équilibrer l'avantage du premier joueur). La règle de
   distance (deux colonies ne peuvent pas être adjacentes) est appliquée
   côté serveur. Seule la **2ème colonie** de chaque joueur rapporte
   immédiatement les ressources des tuiles adjacentes (règle standard
   Catan ; la 1ère colonie ne rapporte rien).
3. **Tour de jeu** :
   - Le joueur actif lance 2 dés (bouton "Lancer les dés").
   - Tous les joueurs ayant une colonie adjacente à une tuile portant le
     numéro tiré reçoivent 1 unité de la ressource correspondante.
   - Le joueur actif peut ensuite construire des routes (1 bois + 1
     argile) et/ou des colonies (1 bois + 1 argile + 1 mouton + 1 blé),
     autant de fois que ses ressources le permettent.
   - Le joueur termine son tour, la main passe au suivant.
4. **Validations côté serveur** : ressources suffisantes, emplacement
   libre, règle de distance entre colonies, connexion au réseau de routes
   du joueur. Le serveur est la seule source de vérité — le client ne fait
   qu'afficher l'état reçu et envoyer des intentions d'action.
5. **Cartes développement** (achat : 1 mouton + 1 blé + 1 minerai, une
   seule carte jouable par tour, jamais le tour où elle est achetée) :
   - *Construction de route* : place 2 routes gratuitement.
   - *Invention* : reçoit 2 ressources gratuites au choix (banque).
   - *Monopole* : récupère toutes les cartes d'une ressource chez tous les
     autres joueurs.
   - *Point de Victoire* : reste secrète, ne se joue pas, compte pour les
     points de victoire de son propriétaire uniquement.
   - Pas de Chevalier (voir "Hors périmètre" ci-dessous).
6. **Titre "Route la plus longue"** : recalculé automatiquement après
   chaque construction de route/colonie. Il faut au moins 5 routes
   connectées en une chaîne continue (coupée par une colonie adverse sur le
   trajet) pour y prétendre ; le titre ne change de main que si un autre
   joueur dépasse strictement la longueur du détenteur actuel.
7. **Échanges** :
   - *Entre joueurs* : le joueur actif propose un échange (ressources
     données ↔ demandées) visible de tous ; n'importe quel autre joueur
     peut l'accepter (premier arrivé, premier servi), ou le proposant peut
     l'annuler. Une seule offre à la fois.
   - *Avec la banque* : 4 ressources identiques contre 1 ressource au
     choix, à tout moment pendant sa phase de construction.
8. **Confidentialité des mains** : chaque joueur voit le détail de ses
   propres ressources et cartes développement ; pour les autres joueurs, il
   ne voit que des totaux (nombre de cartes), jamais le détail — géré côté
   serveur (chaque client reçoit une vue personnalisée de l'état).
9. **Villes** : pendant sa phase de construction, le joueur actif peut
   améliorer une de ses colonies existantes en ville (coût 2 blé + 3
   minerai). Une ville rapporte **2 unités** de la ressource correspondante
   à chaque lancer de dé gagnant, au lieu d'1 pour une colonie simple. Une
   colonie ne peut être améliorée qu'une fois (pas de niveau au-delà de
   ville).
10. **Points de victoire** : chaque colonie vaut 1 point, chaque ville 2
    points, et le titre "Route la plus longue" ajoute 2 points à son
    détenteur — ce total *public* est visible pour tous les joueurs dans la
    liste des joueurs. Les cartes Point de Victoire en main restent
    secrètes : seul leur propriétaire voit son total *complet* (public +
    cartes secrètes), affiché uniquement sur sa propre ligne.
11. **Fin de partie automatique** : dès qu'un joueur atteint **10 points**
    (public + cartes Point de Victoire secrètes comprises, y compris juste
    après l'achat d'une carte), la partie s'arrête immédiatement — même si
    ce n'est pas son tour. Le gagnant retourne alors ses cartes secrètes
    (elles deviennent visibles de tous, comme à la table) et un écran de
    victoire animé (confettis + classement final) s'affiche chez tous les
    joueurs, avec un bouton "Nouvelle partie" qui ramène tout le monde au
    salon d'attente (mêmes joueurs, nouvelle partie). Plus aucune action de
    jeu n'est possible une fois la partie terminée, à part relancer une
    nouvelle partie.

### Hors périmètre (volontairement)

Voleur, règle du 7 et Chevalier (les trois vont ensemble : sans voleur, pas
de Chevalier ni d'armée la plus grande), ports d'échange.

## Architecture

```
catan-mvp/
├── server/
│   └── src/
│       ├── index.js          # bootstrap Express + Socket.io
│       ├── socketHandlers.js # événements socket <-> gameLogic
│       ├── gameLogic.js      # règles du jeu, état, validations (pur JS)
│       ├── board.js          # génération du plateau hexagonal (tuiles/sommets/arêtes)
│       └── constants.js      # coûts, couleurs, seuils de joueurs, jetons, cartes dev
└── client/
    └── src/
        ├── App.jsx           # état applicatif, connexion socket, layout
        ├── socket.js         # instance socket.io-client
        ├── buildCosts.js     # coûts de construction (affichage)
        └── components/
            ├── Lobby.jsx
            ├── Board3D.jsx       # rendu 3D (Three.js) du plateau + clics de construction/placement
            ├── GameBoard.jsx     # ancien rendu SVG à plat, conservé mais plus utilisé par App.jsx
            ├── PlayerResources.jsx
            ├── DiceRoller.jsx
            ├── PlayersList.jsx   # liste des joueurs + titre "Route la plus longue"
            ├── DevCards.jsx      # achat/main/jeu des cartes développement
            ├── TradePanel.jsx    # proposition d'échange entre joueurs + banque
            ├── VictoryOverlay.jsx # écran de fin de partie (confettis, classement, "Nouvelle partie")
            └── GameLog.jsx
```

### Modèle de données du plateau

Le plateau est généré côté serveur en coordonnées axiales, puis converti en
pixels. Les sommets (intersections) et arêtes (segments de route) sont
déduits automatiquement : deux tuiles voisines calculent le même coin en
pixels, qui devient donc le même identifiant de sommet partagé. Le serveur
envoie au client les coordonnées x/y de chaque tuile, sommet et arête : le
client n'a aucune géométrie hexagonale à recalculer. `Board3D.jsx` convertit
simplement ces coordonnées 2D en positions 3D (un facteur d'échelle fixe,
x → x, y → z, altitude = 0 pour la surface du plateau) : tuiles, sommets et
arêtes restent donc parfaitement alignés entre eux, exactement comme dans
l'ancien rendu SVG (`GameBoard.jsx`, conservé dans le dépôt mais plus
utilisé).

### Plateau 3D

Le plateau est rendu avec [Three.js](https://threejs.org/) via
[`@react-three/fiber`](https://docs.pmnd.rs/react-three-fiber) (React) et
[`@react-three/drei`](https://github.com/pmndrs/drei) (utilitaires : caméra
libre `OrbitControls`, étiquettes HTML pour les jetons numérotés). Aucun
modèle 3D externe n'est chargé : chaque tuile, arbre, montagne, mouton,
colonie ou ville est composé à la volée à partir de formes géométriques
simples (cônes, boîtes, sphères) — pas de fichier `.glb`/`.gltf` à
télécharger, donc rien qui puisse être bloqué par un pare-feu d'entreprise.
Chaque tuile est un vrai prisme hexagonal construit à partir des coordonnées
exactes de ses sommets (garantit qu'il n'y a jamais d'espace ni de
chevauchement entre deux tuiles voisines), et les décors (arbres, pics
rocheux, buttes d'argile, moutons, épis de blé, rochers du désert) sont
placés aléatoirement mais de façon stable (seed dérivée de l'identifiant de
la tuile, donc les décors ne "sautent" pas à chaque mise à jour de l'état de
la partie). La caméra se pilote à la souris (clic-glisser = rotation autour
du plateau, molette = zoom, clic droit ou deux doigts = déplacement latéral)
via `OrbitControls`, avec des limites de zoom/angle pour ne jamais passer
sous le plateau. Les clics sur une intersection ou un segment de route
utilisent le raycasting standard de `react-three-fiber` (`onClick` /
`onPointerOver` sur les meshes) et déclenchent exactement les mêmes
callbacks (`onVertexActivate` / `onEdgeActivate`) que l'ancien rendu SVG :
aucune règle de jeu n'a changé, seul l'habillage visuel est nouveau.

### Synchronisation d'état

Un seul état de partie (`gameState`) vit en mémoire côté serveur. Chaque
action valide (rejoindre, démarrer, lancer les dés, construire, acheter/
jouer une carte, échanger, terminer son tour) déclenche une réémission de
l'état à tous les clients connectés. Depuis l'ajout des cartes
développement, cette diffusion n'est plus un `io.emit()` unique mais une
vue **personnalisée par socket** (`getPublicStateFor(state, viewerId)`
dans `gameLogic.js`) : chaque joueur reçoit le détail de ses propres
ressources et cartes, mais seulement le total (nombre de cartes) pour les
autres — c'est la seule information cachée de ce MVP (avec, en plus, les
cartes Point de Victoire secrètes, revélées uniquement pour le gagnant une
fois la partie terminée). Le reste (plateau, routes, colonies, tour en
cours, offre d'échange en cours...) reste identique pour tout le monde,
dans l'esprit "broadcast" initial, pour garder la synchronisation simple et
robuste pour un petit groupe de joueurs — à optimiser plus tard si besoin
(diffs, rooms multiples, persistance).

### Détection de fin de partie

`checkForWinner(state)` (dans `gameLogic.js`) est appelée après toute
action pouvant faire évoluer un score : construction de route/colonie
(via `updateLongestRoad`, qui recalcule aussi le titre "Route la plus
longue"), amélioration en ville, et achat d'une carte développement (au cas
où ce serait une carte Point de Victoire). Dès qu'un joueur atteint
`WINNING_SCORE` (10, défini dans `constants.js`) en cumulant points publics
et cartes secrètes, `state.status` passe à `'finished'` : toute nouvelle
action de jeu est alors rejetée (`assertPlayersTurn`/`assertSetupTurn`
renvoient une erreur dès que le statut n'est plus `'playing'`/`'setup'`).
L'événement `new_game` (géré par `newGame(state)`) permet de repartir sur
un salon d'attente propre avec les mêmes joueurs connectés, sans redémarrer
le serveur.

## Prochaines étapes possibles

- Voleur + règle du 7 + Chevalier + titre "Armée la plus grande".
- Ports d'échange.
- Persistance de la partie (reconnexion après rafraîchissement de page).
- Plusieurs tables de jeu en parallèle (système de "rooms").
- Choix du destinataire d'une offre d'échange (plutôt que "premier arrivé,
  premier servi" parmi tous les autres joueurs).
