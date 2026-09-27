/**
 * E5 远洋时代可玩性推演（T5 验收脚本）。
 *
 * 目的：证明 E5 不只是"编译通过"，而是**真的能从忍耐期走到跃迁**。
 *
 * 性能提示：tick 内部与 autoXxx 都会调用 aggregateEffects（遍历全部 ~135 项科技），
 * 因此本脚本刻意使用**粗步长 + 低频决策**：
 *   · STEP = 5s（决策频率降到每 5 秒一次，对配平结论无影响）
 *   · autoBuild / autoResearch 每 5 步才跑一次
 * 早期版本用 STEP=1 + 每步决策，40000 步跑不完 —— 那不是引擎慢，是脚本自己在刷。
 *
 * 用法（tsx 缺失时）：
 *   node .\node_modules\typescript\bin\tsc --outDir <tmp> --module commonjs \
 *        --target es2020 --moduleResolution node --skipLibCheck --esModuleInterop \
 *        src\dev\e5-autoplay.ts
 *   node <tmp>\dev\e5-autoplay.js
 */
import {
  tick,
  canResearch,
  isTechAvailable,
  canAffordBuilding,
  getBuildingCost,
  isBuildingUnlocked,
  checkAdvance,
  aggregateEffects,
} from '../game/engine';
import type { E1State } from '../game/engine';
import { TECHS, techsOfEra } from '../data/techs';
import { JOBS } from '../data/jobs';
import { E5 } from '../data/constants';

const STEP = 5;
const HARD_CAP = 60000;

/** §11.8 的科技优先顺序：先 k 相关，再印刷链，再航海与科学 */
const TECH_ORDER = [
  'printing', 'papermaking', 'movable_type', 'university_system',
  'rag_paper', 'water_powered_pulp', 'alloy_type', 'university_charter',
  'secular_schools', 'vernacular_printing',
  'compass', 'celestial_navigation', 'caravel', 'astrolabe_quadrant', 'logbook',
  'double_entry_bookkeeping', 'gunpowder', 'scholarship', 'workshop_division',
  'public_library', 'proofreading_pagination', 'oil_ink', 'printers_guild',
  'anatomy', 'bank_credit',
  'lateen_sail', 'new_crops', 'mining_blasting', 'telescope', 'colonial_outpost',
  'heliocentrism', 'scientific_method', 'double_press', 'circumnavigation',
  'steam_engine',
];

function makeE5State(): E1State {
  const techs: Record<string, boolean> = {};
  for (const t of TECHS) if (t.era !== 'E5') techs[t.id] = true;
  const jobs: Record<string, number> = {};
  for (const j of JOBS) jobs[j.id] = 0;
  const buildings: Record<string, number> = {};
  for (const b of ['house', 'hearth', 'field', 'granary', 'academy', 'city_house', 'mint', 'legion_camp']) {
    buildings[b] = 0;
  }
  buildings.house = 4;
  buildings.field = 20;
  buildings.city_house = 10;
  buildings.granary = 20;
  buildings.academy = 4;

  return {
    era: 'E5',
    food: 50000, wood: 50000, stone: 50000, experience: 100000,
    livestock: 0, fabric: 0, eraElapsedSec: 0,
    population: 400, populationProgress: 0, fire: 50,
    copper: 0, tin: 0, bronze: 0, lapis: 0, iron: 20000, coin: 100000,
    territory: 20, legions: 0, expansionPending: null,
    p1Unlocked: true, legacyPoints: 0,
    recorded: [], recordedOnce: [], tradeRoutes: [], reputation: 50,
    jobs, buildings, techs, autoMaintainFire: true,
    paper: 0, books: 0, silver: 0, researchPoints: 0, exoticGoods: 0,
    literacy: 12, voyages: [], loan: 0,
  } as unknown as E1State;
}

function main(): void {
  const s = makeE5State();
  const bag = s as unknown as Record<string, number>;
  const e5Techs = techsOfEra('E5');

  let t = 0;
  let advanceAt = -1;
  let newWorldAt = -1;
  let firstResearchAt = -1;
  let peakSilver = 0;
  let peakLiteracy = 0;
  let peakR = 1;
  let peakBooks = 0;
  let starvationSec = 0;

  const countE5 = (): number => e5Techs.filter(x => s.techs[x.id]).length;

  const tryBuild = (id: string): boolean => {
    if (!isBuildingUnlocked(id as never, s)) return false;
    if (!canAffordBuilding(id as never, s)) return false;
    const cost = getBuildingCost(id as never, s);
    for (const [res, amount] of Object.entries(cost)) {
      const owned = bag[res];
      if (typeof owned === 'number') bag[res] = owned - (amount as number);
    }
    s.buildings[id] = (s.buildings[id] ?? 0) + 1;
    return true;
  };

  const autoBuild = (): void => {
    const mills = s.buildings.paper_mill ?? 0;
    const shops = s.buildings.printing_workshop ?? 0;
    const harbors = s.buildings.harbor ?? 0;
    const unis = s.buildings.university ?? 0;
    const libs = s.buildings.library ?? 0;

    // 印刷链按产能比例铺开（造纸坊 6 工位 / 印书坊 8 / 大学 5）
    // 顺序要点：**航海港优先级仅次于造纸坊** —— 它是白银的唯一入口，
    // 而印书坊与大学都要白银。晚造港 = 链条卡死在"有纸无书"。
    if (mills < 4 && mills <= shops && tryBuild('paper_mill')) return;
    if (harbors < 3 && tryBuild('harbor')) return;
    if (shops < 12 && shops < mills * 2 && tryBuild('printing_workshop')) return;
    // 大学同时抬识字率上限与学者工位
    if (unis < 6 && tryBuild('university')) return;
    // 图书馆：典籍存储（典籍溢出会让印刷工白干）
    if (libs < 4 && s.books > 10000 && tryBuild('library')) return;
    if (mills < 10 && tryBuild('paper_mill')) return;
    if (shops < 16 && tryBuild('printing_workshop')) return;
  };

  const autoAssign = (): void => {
    const pop = Math.floor(s.population);
    const next: Record<string, number> = {};
    for (const j of JOBS) next[j.id] = 0;
    if (pop <= 0) { s.jobs = next; return; }
    let left = pop;
    const take = (id: string, n: number): void => {
      const use = Math.min(Math.max(0, n), left);
      if (use <= 0) return;
      next[id] = (next[id] ?? 0) + use;
      left -= use;
    };

    // 食物优先：E5 走 E2 口径人均 0.25/秒
    const fieldSlots = (s.buildings.field ?? 0) * 3;
    take('farmer', Math.min(fieldSlots, Math.ceil(pop * 0.12)));
    take('woodcutter', Math.max(4, Math.ceil(pop * 0.06)));
    // 石头：造纸坊、图书馆、大学都要石头。人力充足时必须派打石者，
    // 否则大学（成本 stone 500×1.35^n）会一直卡在"石头不够"上。
    take('knapper', Math.max(10, Math.ceil(pop * 0.05)));

    // 印刷链三段：按工位填满
    take('papermaker', (s.buildings.paper_mill ?? 0) * 6);
    take('printer', (s.buildings.printing_workshop ?? 0) * 8);
    const uniSlots = (s.buildings.university ?? 0) * 5;
    take('scholar', Math.floor(uniSlots * 0.75));
    take('teacher', uniSlots - Math.floor(uniSlots * 0.75));

    // 航海：按在航船队配水手
    take('sailor', Math.max((s.voyages ?? []).length * 12, 24));

    if (left > 0) take('gatherer', left);
    s.jobs = next;
  };

  const autoResearch = (): void => {
    for (const id of TECH_ORDER) {
      if (s.techs[id]) continue;
      const def = TECHS.find(x => x.id === id);
      if (!def || !isTechAvailable(id, s) || !canResearch(id, s).ok) continue;
      s.experience -= def.cost;
      s.techs[id] = true;
      return;
    }
  };

  const autoVoyage = (): void => {
    const harbors = s.buildings.harbor ?? 0;
    if (harbors <= 0) return;
    if (!aggregateEffects(s).voyageEnabled) return;
    const voyages = s.voyages ?? [];
    if (voyages.length >= Math.min(harbors, 3)) return;

    // 首次出海必须选第 1 环（近海，无白银成本）——第 2 环要 50 银，
    // 而开局白银为 0，选第 2 环会永远出不去。
    // 先用近海把白银滚起来，再换远洋去拿「发现新大陆」。
    const wantsNewWorld = !s.techs['steam_engine'] && s.silver >= 50;
    const ring: 1 | 2 | 3 = wantsNewWorld ? 2 : 1;
    const cost = E5.VOYAGE_COST[ring];
    if (s.wood < (cost.wood ?? 0) || s.iron < (cost.iron ?? 0)) return;
    if ((cost.silver ?? 0) > 0 && s.silver < (cost.silver ?? 0)) return;
    if ((s.jobs.sailor ?? 0) < E5.VOYAGE_SAILORS[ring]) return;

    s.wood -= cost.wood ?? 0;
    s.iron -= cost.iron ?? 0;
    s.silver -= cost.silver ?? 0;
    voyages.push({
      ring, progress: 0,
      target: E5.VOYAGE_DURATION[ring],
      sailors: E5.VOYAGE_SAILORS[ring],
      newWorldFound: false,
    });
    s.voyages = voyages;
  };

  const log: string[] = [];
  const logged = new Set<number>();
  let step = 0;

  while (t < HARD_CAP) {
    const r = tick(s, STEP);
    s.food = r.food; s.wood = r.wood; s.stone = r.stone;
    s.experience = r.experience; s.livestock = r.livestock; s.fabric = r.fabric;
    s.eraElapsedSec = r.eraElapsedSec; s.population = r.population;
    s.populationProgress = r.populationProgress; s.fire = r.fire;
    s.iron = r.iron; s.coin = r.coin; s.territory = r.territory;
    s.paper = r.paper; s.books = r.books; s.silver = r.silver;
    s.researchPoints = r.researchPoints; s.exoticGoods = r.exoticGoods;
    s.literacy = r.literacy; s.voyages = r.voyages; s.loan = r.loan;

    t += STEP;
    step++;

    // 决策降频：每 5 步（25 游戏秒）一次，足够代表一个思考中的玩家
    if (step % 5 === 0) {
      autoResearch();
      autoAssign();
      autoBuild();
      autoVoyage();
    }

    if (firstResearchAt < 0 && s.researchPoints > 0) firstResearchAt = Math.round(t);
    if (newWorldAt < 0 && (s.voyages ?? []).some(v => v.newWorldFound)) newWorldAt = Math.round(t);
    peakSilver = Math.max(peakSilver, s.silver);
    peakLiteracy = Math.max(peakLiteracy, s.literacy);
    peakBooks = Math.max(peakBooks, s.books);
    if (s.food <= 0) starvationSec += STEP;

    // 复利采样降频（aggregateEffects 是热点）
    if (step % 40 === 0) {
      const eff = aggregateEffects(s);
      const n = e5Techs.filter(x => s.techs[x.id]).length;
      peakR = Math.max(peakR, 1 + eff.compoundKAdd * Math.min(n, 35));
    }

    const sec = Math.round(t);
    if (sec % 5000 === 0 && !logged.has(sec)) {
      logged.add(sec);
      log.push(
        `  ${String(sec).padStart(6)}s | 人口 ${String(Math.floor(s.population)).padStart(4)} | ` +
        `纸 ${Math.round(s.paper).toString().padStart(6)} | 典 ${Math.round(s.books).toString().padStart(6)} | ` +
        `研 ${Math.round(s.researchPoints).toString().padStart(8)} | 银 ${Math.round(s.silver).toString().padStart(5)} | ` +
        `识字 ${s.literacy.toFixed(1).padStart(4)}% | E5科技 ${String(countE5()).padStart(2)}/${e5Techs.length} | ` +
        `船 ${(s.voyages ?? []).length}`
      );
    }

    if (advanceAt < 0 && checkAdvance(s).ok) { advanceAt = sec; break; }
  }

  console.log('=== E5 远洋时代自动试玩 ===\n');
  console.log(log.join('\n'));
  console.log('');
  console.log(`E5 科技完成：${countE5()}/${e5Techs.length}`);
  console.log(`首次产出研究点：${firstResearchAt >= 0 ? `${firstResearchAt}s` : '未发生'}`);
  console.log(`发现新大陆：${newWorldAt >= 0 ? `${newWorldAt}s` : '未发生'}`);
  console.log(`峰值：复利 R ×${peakR.toFixed(2)} | 识字率 ${peakLiteracy.toFixed(1)}% | 典籍 ${Math.round(peakBooks)} | 白银 ${Math.round(peakSilver)}`);
  console.log(`累计饥饿时长：${starvationSec}s`);
  console.log(`末态：人口 ${Math.floor(s.population)} | 典籍 ${Math.round(s.books)} | 研究点 ${Math.round(s.researchPoints)} | 异域物产 ${Math.round(s.exoticGoods)} | 银 ${Math.round(s.silver)}`);
  console.log('');

  const adv = checkAdvance(s);
  console.log('★ 跃迁检查（checkAdvance）:');
  for (const item of adv.items) {
    console.log(`   ${item.done ? '✅' : '⬜'} ${item.label} —— ${item.detail}`);
  }
  console.log(`   ${adv.ok ? '→ 可以跃迁到 E6' : '→ 尚未满足'}`);
  if (advanceAt >= 0) console.log(`🎓 E5 通关时间：${advanceAt}s = ${(advanceAt / 60).toFixed(1)} 分钟`);
  else console.log(`⛔ ${Math.round(t)}s 内未满足全部跃迁条件`);
}

main();
