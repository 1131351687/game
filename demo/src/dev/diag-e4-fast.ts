// Minimal scripted E4 diagnostic.
// Usage: npx --yes tsx src/dev/diag-e4-fast.ts
//
// This deliberately does not run the long E1-E3 autoplay. It starts from a
// deterministic E4 state shaped like a real E4 transition and answers:
//   1. Can iron -> coin conversion sustain expansion?
//   2. Do expansion requirements increase and gate correctly?
//   3. Can a representative army reach 20 territory and satisfy unification?
//
// The expensive E1-E3 chain is covered by regression tests; this script is the
// fast integration check for E4's own loop.

import {
  BUILDING_MAP,
  E4,
  JOBS,
  TECHS,
  canAffordBuilding,
  canResearch,
  checkAdvance,
  getBuildingCost,
  getExpansionRequirement,
  isBuildingUnlocked,
  tick,
  type E1State,
} from '../game/engine';

const STEP = 1;
const MAX_SECONDS = 20 * 60 * 60;

const s: E1State = {
  era: 'E3',
  food: 0,
  wood: 0,
  stone: 0,
  experience: 0,
  population: 0,
  populationProgress: 0,
  fire: 0,
  livestock: 0,
  fabric: 0,
  eraElapsedSec: 0,
  copper: 0,
  tin: 0,
  bronze: 0,
  lapis: 0,
  iron: 0,
  coin: 0,
  territory: 1,
  legions: 0,
  expansionPending: null,
  p1Unlocked: false,
  legacyPoints: 0,
  recorded: [],
  recordedOnce: [],
  tradeRoutes: [],
  reputation: 50,
  jobs: {},
  buildings: {},
  techs: {},
  autoMaintainFire: false,
};

// A realistic post-E3 opening: the E3 gate guarantees a developed settlement.
s.era = 'E4';
s.population = 220;
s.food = 5000;
s.wood = 4000;
s.stone = 3000;
s.experience = 500000;
s.iron = 2000;
s.coin = 3000;
s.p1Unlocked = true;
s.techs.iron = true;
s.techs.copper_mining = true;
s.techs.tin_mining = true;
s.jobs.farmer = 70;
s.jobs.woodcutter = 30;
s.jobs.iron_miner = 20;
s.jobs.mint_worker = 20;
s.buildings.field = 30;
s.buildings.granary = 6;
s.buildings.city_house = 6;
s.buildings.mint = 1;

const researchOrder = [
  'steel',
  'iron_tools',
  'coinage',
  'legion_organization',
  'census',
  'heavy_plow',
  'water_management',
  'minting',
  'road_building',
  'military_farms',
  'military_merit',
  'provincial_system',
  'iron_weapons',
  'administrative_records',
  'cavalry',
  'siegecraft',
  'logistics',
  'imperial_standard',
  'standard_army',
  'campaign_command',
  'unification',
];

const buildOrder = ['mint', 'legion_camp', 'royal_road', 'armory'] as const;
const BUILD_CAPS: Record<(typeof buildOrder)[number], number> = {
  mint: 3,
  legion_camp: 4,
  royal_road: 3,
  armory: 3,
};

function researchOne(): void {
  for (const id of researchOrder) {
    if (s.techs[id]) continue;
    const def = TECHS.find(x => x.id === id);
    if (!def || !canResearch(id, s).ok || s.experience < def.cost) return;
    s.experience -= def.cost;
    s.techs[id] = true;
    return;
  }
}

function buildOne(): void {
  for (const id of buildOrder) {
    if ((s.buildings[id] ?? 0) >= BUILD_CAPS[id]) continue;
    if (!isBuildingUnlocked(id, s) || !canAffordBuilding(id, s)) continue;
    const cost = getBuildingCost(id, s);
    const nextCampaign = getExpansionRequirement(s);
    const leavesCampaignSupplies = (res: keyof E1State): boolean => {
      if (!nextCampaign) return true;
      const amount = cost[res as keyof typeof cost];
      if (typeof amount !== 'number') return true;
      const after = (s[res] as number) - amount;
      if (res === 'iron') return after >= nextCampaign.ironCost;
      if (res === 'coin') return after >= nextCampaign.coinCost;
      return true;
    };
    const isFirstMint = id === 'mint' && (s.buildings.mint ?? 0) === 0;
    if (!isFirstMint && (!leavesCampaignSupplies('iron') || !leavesCampaignSupplies('coin'))) continue;
    for (const [res, amount] of Object.entries(cost)) {
      const key = res as keyof E1State;
      if (typeof s[key] === 'number') (s[key] as number) -= amount as number;
    }
    s.buildings[id] = (s.buildings[id] ?? 0) + 1;
    return;
  }
}

function assignJobs(): void {
  const jobs: Record<string, number> = {};
  for (const job of JOBS) jobs[job.id] = 0;
  let left = Math.floor(s.population);
  const take = (id: string, n: number): void => {
    const used = Math.min(left, Math.max(0, Math.floor(n)));
    jobs[id] = used;
    left -= used;
  };
  take('farmer', Math.ceil(s.population * 0.35));
  take('woodcutter', Math.ceil(s.population * 0.08));
  take('iron_miner', Math.max(20, Math.ceil(s.population * 0.1)));
  take('mint_worker', (s.buildings.mint ?? 0) * 20);
  take('legion', (s.buildings.legion_camp ?? 0) * 20 + (s.buildings.armory ?? 0) * 5);
  take('gatherer', left);
  s.jobs = jobs;
  s.legions = jobs.legion ?? 0;
}

function expandOne(elapsed: number): boolean {
  if (s.expansionPending) return false;
  const req = getExpansionRequirement(s);
  if (!req || s.coin < req.coinCost || s.iron < req.ironCost || (s.jobs.legion ?? 0) < req.legionNeed) return false;
  s.coin -= req.coinCost;
  s.iron -= req.ironCost;
  s.expansionPending = { until: elapsed + req.flatSec, targetN: req.targetN };
  return true;
}

console.log('=== E4 fast diagnostic ===');
console.log(`start: territory=${s.territory} pop=${s.population} iron=${s.iron} coin=${s.coin}`);

let elapsed = 0;
let lastExpansion = -999;
let expansionAttempts = 0;
while (elapsed < MAX_SECONDS && !checkAdvance(s).ok) {
  Object.assign(s, tick(s, STEP));
  elapsed += STEP;
  researchOne();
  buildOne();
  assignJobs();
  if (elapsed - lastExpansion >= 10 && expandOne(elapsed)) {
    lastExpansion = elapsed;
    expansionAttempts += 1;
  }
  if (elapsed % 600 === 0) {
    const req = getExpansionRequirement(s);
    console.log(
      `${elapsed}s | terr ${s.territory} | pop ${Math.floor(s.population)} | iron ${Math.round(s.iron)} | coin ${Math.round(s.coin)} | legion ${s.jobs.legion ?? 0} | next ${req ? req.coinCost + 'c/' + req.ironCost + 'i/' + req.legionNeed + 'l' : 'MAX'}`
    );
  }
}

const adv = checkAdvance(s);
console.log(`end: territory=${s.territory} coin=${Math.round(s.coin)} iron=${Math.round(s.iron)} expansionAttempts=${expansionAttempts}`);
for (const item of adv.items) console.log(`  ${item.done ? 'PASS' : 'FAIL'} ${item.label} - ${item.detail}`);
console.log(adv.ok ? 'E4 fast diagnostic: PASS' : 'E4 fast diagnostic: FAIL');
if (!adv.ok) process.exitCode = 1;
