import { STAGES } from '../store/data';

/**
 * Derive a building's contact count from the junction table.
 */
export function getBuildingContactCount(buildingName, bcMap) {
  return bcMap.get(buildingName)?.length || 0;
}

/**
 * Get contacts for a building.
 */
export function getBuildingContacts(buildingName, bcMap, contactsByEmail) {
  const emails = bcMap.get(buildingName) || [];
  return emails.map(e => contactsByEmail.get(e)).filter(Boolean);
}

/**
 * Build a company index from buildings.
 * Groups buildings by normalized owner_1.
 */
export function buildCompanyIndex(buildings) {
  const suffixRe = /,?\s*(LLC|Inc\.?|Corp\.?|Co\.?|Cos\.?|L\.?P\.?|Ltd\.?|Group|Partners|Advisors|Holdings|Management|Properties|Realty)\s*$/i;
  const companies = new Map();

  for (const b of buildings) {
    const owner = b.owner_1 || 'Unknown Owner';
    const key = owner.replace(suffixRe, '').trim().toLowerCase();

    if (!companies.has(key)) {
      companies.set(key, {
        name: owner.replace(suffixRe, '').trim() || owner,
        displayName: owner,
        buildings: [],
        markets: new Set(),
      });
    }

    const co = companies.get(key);
    co.buildings.push(b);
    if (b.market) co.markets.add(b.market);
  }

  // Sort by building count descending
  return Array.from(companies.values()).sort((a, b) => b.buildings.length - a.buildings.length);
}

/**
 * Derive the "best" stage for a company (most advanced across its buildings).
 * Rank mirrors STAGES array order — higher index = more advanced.
 * SIGNED and DECLINED are terminal and rank highest for display purposes.
 */
export function deriveCompanyStage(companyBuildings) {
  const stageRank = {};
  STAGES.forEach((s, i) => stageRank[s] = i);

  let best = 'NO_CONTACTS';
  for (const b of companyBuildings) {
    const s = b.stage || 'NO_CONTACTS';
    if ((stageRank[s] ?? 0) > (stageRank[best] ?? 0)) best = s;
  }
  return best;
}
