// Coûts de construction affichés côté client. Dupliqués depuis
// server/src/constants.js : dans ce MVP, client et serveur sont deux
// paquets npm séparés sans code partagé, donc on garde une petite
// duplication volontaire plutôt que d'ajouter un monorepo/workspace pour
// si peu de constantes. Le serveur reste la seule source de vérité pour
// la validation réelle des coûts.
export const BUILD_COSTS = {
  route: { bois: 1, argile: 1 },
  colonie: { bois: 1, argile: 1, mouton: 1, ble: 1 },
  ville: { ble: 2, minerai: 3 }
};

export const DEV_CARD_COST = { mouton: 1, ble: 1, minerai: 1 };

export const BANK_TRADE_RATE = 4;
