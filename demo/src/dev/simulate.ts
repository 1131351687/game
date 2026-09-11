// 配平验证 / 自动试玩
//
// 用法：
//   npx tsx src/dev/simulate.ts                     仅跑开局模拟
//   npx tsx src/dev/simulate.ts autoplay            跑 20 分钟 E1 自动试玩
//   npx tsx src/dev/simulate.ts autoplay beeline    E1 极限速通（回归基准：门槛 932s）
//   npx tsx src/dev/simulate.ts autoplay e2         跑 E2 定居时代自动试玩
//
// 用途：改数值后快速看曲线，不用开浏览器。

import {
  tick,
  canResearch,
  isTechAvailable,
  calcExperienceOutput,
  canAffordBuilding,
  getBuildingCost,
  getResourceStorage,
  getCapacity,
  isBuildingUnlocked,
  aggregateEffects,
  checkAdvance,
} from '../game/engine';
import type { E1State } from '../game/engine';
import { TECHS, techsOfEra } from '../data/techs';
import { JOBS } from '../data/jobs';
import { POPULATION, E2 } from '../data/constants';
import { SEASONS, getSeasonFromElapsed, getWinterConsumption } from '../game/season';
import { computeEraTransition, TRANSITION } from '../game/transition';

/** E1 链式推演的时长：beeline 门槛在 932s，多跑到 1200s 模拟"玩家达成门槛后又攒了一会儿" */
const E1_CHAIN_SEC = 1200;
/** `autoplay e2` 打印链式交接表；单独跑 E1 时不需要 */
const quietChain = false;

function makeState(): E1State {
  return {
    era: 'E1',
    food: 20,
    wood: 10,
    stone: 0,
    experience: 0,
    // E2 字段在 E1 恒为 0 —— 季节循环未开启时引擎不会读取它们
    grain: 0,
    livestock: 0,
    fabric: 0,
    eraElapsedSec: 0,
    population: POPULATION.START,
    populationProgress: 0,
    fire: 0,
    jobs: { gatherer: 0, woodcutter: 0, knapper: 0, hunter: 0 },
    buildings: { house: 0, hearth: 0, workshop: 0 },
    techs: {},
    autoMaintainFire: true,
  };
}

function advance(s: E1State, dt: number): void {
  const r = tick(s, dt);
  s.food = r.food;
  s.wood = r.wood;
  s.stone = r.stone;
  s.experience = r.experience;
  s.grain = r.grain;
  s.livestock = r.livestock;
  s.fabric = r.fabric;
  s.eraElapsedSec = r.eraElapsedSec;
  s.population = r.population;
  s.populationProgress = r.populationProgress;
  s.fire = r.fire;
}

// ─────────────────────────────────────────────
// 开局模拟（120 秒）
// ─────────────────────────────────────────────
function openingSim(): void {
  console.log('=== 开局模拟（120 秒）===\n');
  const cases: [string, number][] = [
    ['【不派采集者】', 0],
    ['【派 2 个采集者】', 2],
  ];
  for (const [label, g] of cases) {
    const s = makeState();
    s.jobs.gatherer = g;
    let minPop = s.population;
    for (let t = 0; t < 120; t += 0.25) {
      advance(s, 0.25);
      minPop = Math.min(minPop, s.population);
    }
    console.log(
      `${label}  120秒后: 人口 ${s.population.toFixed(2)}（最低 ${minPop.toFixed(2)}）| ` +
        `食物 ${s.food.toFixed(1)} | 经验 ${s.experience.toFixed(1)}`
    );
  }
  console.log('');
}

// ─────────────────────────────────────────────
// 自动试玩（模拟一个"还算聪明"的玩家）
// ─────────────────────────────────────────────
function autoplay(
  totalSec = 1200,
  opts: { quiet?: boolean; strategy?: 'greedy' | 'focus' | 'beeline' } = {}
): E1State {
  const s = makeState();
  const researched: string[] = [];
  /** 首次达成门槛科技的秒数；-1 表示未达成 */
  let firstGateAt = -1;

  // 像真实玩家那样「重新分配」而不是只加不减
  const autoAssign = (): void => {
    const pop = Math.floor(s.population);
    if (pop <= 0) return;

    const hasFire = !!s.techs['fire_mastery'];
    const hasKnapping = !!s.techs['stone_knapping'];
    const hasSpear = !!s.techs['wooden_spear'];

    let left = pop;
    const next = { gatherer: 0, woodcutter: 0, knapper: 0, hunter: 0 };

    // 1) 火种优先：先留 1 个伐木工维持火（火灭 = 全盘皆输）
    if (hasFire && left > 0) {
      next.woodcutter = 1;
      left -= 1;
    }
    // 2) 打石器（少量，够造建筑即可）
    if (hasKnapping && s.stone < 80 && left > 0) {
      next.knapper = 1;
      left -= 1;
    }
    // 3) 食物：猎人效率高于采集者，优先用猎人补足
    const need = pop * 0.2;
    if (hasSpear && left > 0) {
      while (left > 0 && next.hunter * 1.2 < need * 1.6) {
        next.hunter += 1;
        left -= 1;
      }
    }
    // 4) 其余给采集者
    next.gatherer = left;

    // 只在分配方案变化时写入（避免每 tick 覆盖）
    const changed =
      next.gatherer !== s.jobs.gatherer ||
      next.woodcutter !== s.jobs.woodcutter ||
      next.knapper !== s.jobs.knapper ||
      next.hunter !== s.jobs.hunter;
    if (changed) {
      s.jobs.gatherer = next.gatherer;
      s.jobs.woodcutter = next.woodcutter;
      s.jobs.knapper = next.knapper;
      s.jobs.hunter = next.hunter;
    }
  };

  // 三种研究策略：
  //   greedy  = 贪心买最便宜的（广度优先，会把最贵的门槛拖到最后）
  //   focus   = 火之技艺优先，但买不起时退而买便宜的（实战常见的折中打法）
  //   beeline = 只买「通往门槛的必需项」，其余一律跳过（极限速通，验证最短通路）
  const args = process.argv.slice(1);
  const strategy =
    opts.strategy ??
    (args.includes('beeline') ? 'beeline' : args.includes('focus') ? 'focus' : 'greedy');
  const FIRE_BRANCH = ['fire_starting', 'cooking', 'hearth_construction', 'hot_rock_cooking', 'torch', 'fire_preservation'];
  // 通关必需：核心 + 一条完整分支（火之技艺最便宜） + 门槛科技的前置 + 门槛
  // 「植物栽培」现为汇聚点：requires 石器打制 + 绳索编织（绳索还要住所→协作），
  // 所以这两条支路也进了必点集。
  const REQUIRED = new Set([
    'fire_mastery',
    ...FIRE_BRANCH,
    'stone_knapping',
    'shelter_building',
    'group_cooperation',
    'rope_weaving',
    'plant_cultivation',
  ]);

  const autoResearch = (now: number): void => {
    const cands = TECHS.filter(
      t => !s.techs[t.id] && isTechAvailable(t.id, s) && canResearch(t.id, s).ok
    );
    if (cands.length === 0) return;

    let pick;
    if (strategy === 'beeline') {
      // 只买必需项；买不起就等着
      const next = TECHS.filter(
        t => REQUIRED.has(t.id) && !s.techs[t.id] && isTechAvailable(t.id, s) && canResearch(t.id, s).ok
      ).sort((a, b) => a.cost - b.cost)[0];
      if (!next) return;
      pick = next;
    } else if (strategy === 'focus') {
      const nextFire = FIRE_BRANCH.find(id => !s.techs[id] && isTechAvailable(id, s) && canResearch(id, s).ok);
      const gate = cands.find(t => t.id === 'plant_cultivation');
      pick = nextFire ? TECHS.find(t => t.id === nextFire)! : (gate ?? cands.sort((a, b) => a.cost - b.cost)[0]);
    } else {
      cands.sort((a, b) => a.cost - b.cost);
      pick = cands[0];
    }

    s.experience -= pick.cost;
    s.techs[pick.id] = true;
    researched.push(pick.name);
    if (pick.id === 'plant_cultivation') firstGateAt = Math.round(now);
  };

  const autoBuild = (): void => {
    if (!s.techs['shelter_building']) return;
    const cost = Math.ceil(30 * Math.pow(1.35, s.buildings.house));
    if (s.wood >= cost && s.buildings.house < 4) {
      s.wood -= cost;
      s.buildings.house += 1;
    }
  };

  const marks = [60, 300, 600, 900, 1200];
  const logged = new Set<number>();
  const log: string[] = [];

  for (let t = 0; t < totalSec; t += 0.25) {
    advance(s, 0.25);
    autoAssign();
    autoResearch(t);
    autoBuild();

    // 0.25 秒步长下 Math.round(t) 会在同一秒命中 3–4 次
    // （t = 59.75 / 60.00 / 60.25 全部取整到 60），故必须用 Set 去重，
    // 否则同一条日志会连续打印四遍。
    const mark = Math.round(t);
    if (marks.includes(mark) && !logged.has(mark)) {
      logged.add(mark);
      log.push(
        `  ${String(mark).padStart(4)}s | 人口 ${s.population.toFixed(1).padStart(4)} | ` +
          `食物 ${s.food.toFixed(0).padStart(4)} | 木 ${s.wood.toFixed(0).padStart(3)} | ` +
          `火 ${s.fire.toFixed(0).padStart(3)} | 经验 ${s.experience.toFixed(0).padStart(5)} | ` +
          `科技 ${String(researched.length).padStart(2)}/20 | 住所 ${s.buildings.house}`
      );
    }
  }

  if (!opts.quiet) {
    console.log(`=== 自动试玩（${totalSec / 60} 分钟 · 策略=${strategy}）===\n`);
    console.log(log.join('\n'));
    console.log('');
    console.log(`完成研究 ${researched.length}/20 项：`);
    console.log('  ' + researched.join(' → '));
    console.log('');
    console.log(`经验产出速率（末态）: ${calcExperienceOutput(s).toFixed(2)}/秒`);
    if (s.techs['plant_cultivation']) {
      console.log(`✅ 已达成门槛「植物栽培」，耗时 ${firstGateAt}s（${(firstGateAt / 60).toFixed(1)} 分钟）`);
    } else {
      console.log('❌ 未达门槛「植物栽培」');
    }
  }

  return s;
}

// ─────────────────────────────────────────────
// E2 定居时代自动试玩
// ─────────────────────────────────────────────
/**
 * E2 起始状态 —— **真实走一遍 E1 跃迁**，不再手工镜像。
 *
 * 旧实现把 E2 起始状态硬编码（population: 15 / grain: 300 / wood: 0），
 * 等于把"跃迁产物"抄了一份；一旦 store.advanceEra 改了规则，
 * 模拟器就会和真实游戏漂移（这正是本次要修的 bug 之一）。
 *
 * 现在改为：跑 E1 → 交给 game/transition.ts 的同一个纯函数 → 得到 E2 起始状态。
 * 这样**模拟器验证的就是真实跃迁规则本身**。
 */
function makeE2State(): E1State {
  // E1 跑到 1200s（beeline 门槛在 932s，多跑的 268s 是"玩家在达成门槛后又攒了一会儿"）
  const e1 = autoplay(E1_CHAIN_SEC, { quiet: true, strategy: 'beeline' });
  const t = computeEraTransition(e1, 'E2');

  if (!quietChain) {
    console.log('【时代跃迁交接】E1 → E2（由 game/transition.ts 计算）');
    console.log(
      `  E1 末态：人口 ${Math.floor(e1.population)} | 食物 ${e1.food.toFixed(0)} | ` +
        `木 ${e1.wood.toFixed(0)} | 石 ${e1.stone.toFixed(0)} | 住所 ${e1.buildings.house} | ` +
        `经验 ${e1.experience.toFixed(0)}`
    );
    console.log(
      `  E2 起始：人口 ${Math.floor(t.population)} | 谷物 ${t.grain}（食物 ×${TRANSITION.FOOD_TO_GRAIN} 折算）| ` +
        `木 ${t.wood.toFixed(0)}（继承）| 石 ${t.stone.toFixed(0)}（继承）| ` +
        `村落民居 ${t.buildings.village_house}（K 连续）| 经验 ${t.experience.toFixed(0)}（继承）`
    );
    console.log('');
  }

  return {
    ...t,
    // 火源：E2 已冻结为常量（E2 §11.1「火塘已建成，不再需要维护」）
    fire: e1.fire,
    // 科技继承：E1 的 20 项保留，效果按 eraDecay 自动衰减
    techs: e1.techs,
    autoMaintainFire: true,
  };
}

/** 一个"还算聪明"的定居时代玩家 */
function autoplayE2(): void {
  const STEP = 0.25;
  /** 交接清单要求：至少 2400s（10 游戏年），每 60s 打印一行 */
  const LOG_UNTIL = 2400;
  /** 若 2400s 内未摸到「文字」，继续跑到这里取真实耗时 */
  const HARD_CAP = 16000;

  const s = makeE2State();
  const e2Techs = techsOfEra('E2');
  const bag = s as unknown as Record<string, number>;

  const researched: string[] = [];
  let writingAt = -1;
  /** 首次满足**全部**跃迁条件的秒数；-1 表示推演结束仍未满足 */
  let advanceAt = -1;
  let minGrain = s.grain;
  let famineSec = 0;
  let overflowMarks = 0;
  let t = 0;

  const countE2 = (): number => e2Techs.filter(x => s.techs[x.id]).length;

  // ── 建造 ──（用引擎的解锁 / 成本判定，避免与规则漂移）
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

  const autoBuildE2 = (): void => {
    const cap = getResourceStorage('grain', s);
    const fields = s.buildings.field ?? 0;
    const villages = s.buildings.village_house ?? 0;
    const granaries = s.buildings.granary ?? 0;
    const pens = s.buildings.animal_pen ?? 0;
    const kilns = s.buildings.kiln ?? 0;
    const pop = Math.floor(s.population);
    const K = getCapacity(s);

    // 1) 田地是 K 的主引擎（每块 +12 K、+3 工位）。
    //    只要还有"闲人"（人口 > 田地工位）就继续开田——这是 E2 唯一的
    //    "把人口变成产出"的通道。同时要求人口撑得起下一块田的 2 名农夫，
    //    否则是荒地（设计文档 §4 反刷机制）。
    const fieldSlots = fields * E2.JOBS_PER_FIELD;
    if (
      fields < 12 &&
      pop > fieldSlots &&
      pop >= (fields + 1) * E2.FIELD_MIN_FARMERS &&
      tryBuild('field')
    )
      return;
    // 2) 粮仓：容量逼近溢出就立刻补（溢出的谷物等于白产）
    if (granaries < 4 && s.grain > cap * 0.8 && tryBuild('granary')) return;
    // 3) 村落民居：人口顶到承载力时补
    if (villages < 12 && K < pop + 4 && tryBuild('village_house')) return;
    // 4) 畜栏：活体储备 = 冬季保险
    if (pens < 3 && tryBuild('animal_pen')) return;
    // 5) 陶窑：抬谷物上限（最多 3 座生效）
    if (kilns < 3 && tryBuild('kiln')) return;
    // 6) 兜底：余粮充足就继续开田
    if (fields < 12 && s.grain > 500) tryBuild('field');
  };

  // ── 分配人力 ──
  const autoAssignE2 = (): void => {
    const pop = Math.floor(s.population);
    const next: Record<string, number> = {};
    for (const j of JOBS) next[j.id] = 0;
    if (pop <= 0) {
      s.jobs = next;
      return;
    }

    const season = getSeasonFromElapsed(s.eraElapsedSec);
    const fields = s.buildings.field ?? 0;
    const fieldSlots = fields * E2.JOBS_PER_FIELD;
    let left = pop;

    const take = (id: string, n: number): void => {
      const use = Math.min(Math.max(0, n), left);
      if (use <= 0) return;
      next[id] = (next[id] ?? 0) + use;
      left -= use;
    };

    // ── 教学年：农业尚未研究，人口仍按 E1 规则吃「食物」 ──
    //
    // 这是 E2 最容易踩的坑：季节循环没开，getFoodFactor 走的是 E1 分支，
    // 食物因子为负时人口以 −0.5/秒 衰减，15 人会在 30 秒内归零。
    // 所以这一阶段必须先按 E1 的打法保命（猎人 / 采集者），
    // 一边攒木材石头，一边把 120 经验的「农业」点出来。
    if (!aggregateEffects(s).seasonsEnabled) {
      const need = s.population * POPULATION.FOOD_CONSUMPTION_PER_PERSON; // 0.2 × 人口
      // 猎人性价比更高（1.2/秒 vs 采集者 0.5/秒），优先用猎人补到需求的 2.5 倍
      if (s.techs['wooden_spear']) {
        take('hunter', Math.ceil((need * 2.5) / 1.2));
      }
      if (next.hunter === 0) take('gatherer', Math.ceil((need * 2.5) / 0.5));
      // 余下人力对半分给伐木与打石 —— 为开垦第一块田（80 木 + 50 石）备料
      take('woodcutter', Math.ceil(left / 2));
      take('knapper', left);
      s.jobs = next;
      return;
    }

    // ── 定居阶段 ──

    // 1) 建材：木材/石头是 E2 建筑的唯一来源，但上限只有 500，
    //    所以按"下一座田 80 + 下一座粮仓 120"设目标，不做无脑堆人
    const woodTarget = fields < 10 ? 220 : 160;
    if (s.wood < woodTarget) take('woodcutter', s.wood < 60 ? 4 : 2);
    if (s.techs['stone_knapping'] && s.stone < 150) take('knapper', s.stone < 50 ? 3 : 1);
    // 2) 牲畜：畜栏建好后常驻 1 名牧人
    if ((s.buildings.animal_pen ?? 0) > 0) take('herder', 1);
    // 3) 织物：纺织后派 1 名织工，攒够即撤
    if (s.techs['textile'] && s.fabric < 300) take('weaver', 1);

    // 4) 农耕：谷物是本时代的胜负手
    //
    // ⚠️ 关键：**农夫数不能超过田地工位数**。
    //    超出的人不会产出（田地效率 = min(工位, 农夫/工位)），
    //    只会白白空转——这是本模拟器此前最严重的一处失真：
    //    人口 20、田地 1 块时把 17 个闲人全塞进田里，谷物实际产出为 0，
    //    人口在 180 秒内饿死归零（详见本次交接记录）。
    //    正确做法：只派满工位，余下的人去砍柴打石（才是下一块田的料）。
    if (season === 'winter') {
      // 冬季农业 ×0.05 ≈ 无产出，但**不能把田里的人全抽走**：
      // 承载力 K 只认「已耕作田地」（≥2 名农夫），抽空了 K 会当场塌下来，
      // 人口跟着掉 —— 这正是设计文档 §4 反刷机制在冬季考玩家的地方。
      const keep = Math.min(
        fieldSlots,
        Math.max((s.buildings.field ?? 0) * E2.FIELD_MIN_FARMERS, Math.floor(pop / 4))
      );
      take('farmer', keep);
    } else {
      // 其余季节：把田地工位填满（秋季 ×2.5 是全年粮食大头）
      take('farmer', fieldSlots);
    }

    // 5) 余下人力：继续补建材（开更多的田 = 更多的工位 = 能养更多人）
    take('woodcutter', Math.ceil(left / 2));
    take('knapper', left);

    s.jobs = next;
  };

  // ── 研究（贪心买最便宜的可研究项）──
  const autoResearchE2 = (now: number): void => {
    const cands = e2Techs.filter(
      x => !s.techs[x.id] && isTechAvailable(x.id, s) && canResearch(x.id, s).ok
    );
    if (cands.length === 0) return;
    cands.sort((a, b) => a.cost - b.cost);
    const pick = cands[0];
    s.experience -= pick.cost;
    s.techs[pick.id] = true;
    researched.push(pick.name);
    if (pick.id === 'writing') writingAt = Math.round(now);
  };

  // ── 单步推进 ──
  const step = (): void => {
    advance(s, STEP);
    t += STEP;
    autoResearchE2(t);
    autoAssignE2();
    autoBuildE2();
    minGrain = Math.min(minGrain, s.grain);
    if (s.grain <= 0.01) famineSec += STEP;
    // 首次满足全部跃迁条件的时刻 —— 这才是 E2 真正的"通关时间"
    // （「文字」只是其中一项，还有 ≥8 个冬季 / 谷物 / 人口 / 粮仓 / 田地）
    if (advanceAt < 0 && checkAdvance(s).ok) advanceAt = Math.round(t);
  };

  const row = (): string => {
    const cap = getResourceStorage('grain', s);
    const season = SEASONS[getSeasonFromElapsed(s.eraElapsedSec)];
    const year = Math.floor(s.eraElapsedSec / 240) + 1;
    return (
      `  ${String(Math.round(t)).padStart(5)}s | ${season.name} | 第${String(year).padStart(2)}年 | ` +
      `人口 ${String(Math.floor(s.population)).padStart(3)}/${String(getCapacity(s)).padStart(3)} | ` +
      `谷物 ${s.grain.toFixed(0).padStart(5)}/${cap.toFixed(0).padStart(5)} | ` +
      `牲畜 ${s.livestock.toFixed(0).padStart(3)} | 织物 ${s.fabric.toFixed(0).padStart(4)} | ` +
      `经验 ${s.experience.toFixed(0).padStart(5)} | E2 科技 ${String(countE2()).padStart(2)}/${e2Techs.length}`
    );
  };

  console.log('=== E2 定居时代自动试玩 ===\n');
  console.log(
    `（起始：人口 ${Math.floor(s.population)} / K=${getCapacity(s)} / 谷物 ${s.grain.toFixed(0)} / ` +
      `${s.buildings.village_house} 座村落民居 / 经验 ${s.experience.toFixed(0)} / E1 科技全掌握）\n`
  );

  const log: string[] = [];
  const logged = new Set<number>();
  log.push(row());
  logged.add(0);

  // ── 第一阶段：交接清单要求的 2400s，每 60s 一行 ──
  while (t < LOG_UNTIL) {
    step();
    const mark = Math.round(t);
    if (mark % 60 === 0 && !logged.has(mark)) {
      logged.add(mark);
      const cap = getResourceStorage('grain', s);
      if (s.grain >= cap * 0.999) overflowMarks += 1;
      log.push(row());
    }
  }

  // ── 第二阶段：若还没摸到「文字」，继续跑取真实耗时（每 240s = 1 年一行）──
  const needPhase2 = !s.techs['writing'];
  if (needPhase2) {
    console.log(log.join('\n'));
    console.log('  …… 2400s 内尚未达成「文字」，继续推演至达成或上限 ……\n');
    log.length = 0;
    while (!s.techs['writing'] && t < HARD_CAP) {
      step();
      const mark = Math.round(t);
      // 偏移 60s 采样，避免每次都正好落在年份边界（那会让行行都显示「冬」）
      if ((mark - 60) % 240 === 0 && !logged.has(mark)) {
        logged.add(mark);
        log.push(row());
      }
    }
    console.log(log.join('\n'));
  } else {
    console.log(log.join('\n'));
  }

  // ── 结算 ──
  const adv = checkAdvance(s);
  console.log('');
  console.log(`E2 科技完成：${countE2()}/${e2Techs.length}`);
  if (writingAt >= 0) {
    console.log(`✅ 已研究门槛「文字」，耗时 ${writingAt}s（${(writingAt / 60).toFixed(1)} 分钟）`);
  } else {
    console.log(`❌ ${Math.round(t)}s 内未达成门槛「文字」（已到推演上限）`);
  }
  console.log('');
  console.log(`最低谷物值：${minGrain.toFixed(0)}`);
  console.log(`是否饿过（谷物见底）：${famineSec > 0 ? `是，累计 ${famineSec.toFixed(0)}s` : '否'}`);
  console.log(`谷物触顶溢出次数（按 60s 采样）：${overflowMarks}`);
  console.log(`末态：人口 ${Math.floor(s.population)} / K ${getCapacity(s)} | 谷物 ${s.grain.toFixed(0)} / ${getResourceStorage('grain', s).toFixed(0)} | 牲畜 ${s.livestock.toFixed(0)} | 织物 ${s.fabric.toFixed(0)}`);
  console.log(`末态越冬需求：${getWinterConsumption(s.population).toFixed(0)} 谷物（人口 × 15）—— 当前储备 ${s.grain >= getWinterConsumption(s.population) ? '高于' : '低于'}该需求`);
  console.log('');
  console.log('★ 时代跃迁检查（checkAdvance）：');
  for (const item of adv.items) {
    console.log(`   ${item.done ? '✅' : '⬜'} ${item.label} —— ${item.detail}`);
  }
  console.log(`   ${adv.ok ? '→ 可以跃迁到 E3' : '→ 尚未满足'}`);
  if (advanceAt >= 0) {
    console.log(
      `🎓 E2 通关时间（五项条件全部满足）：${advanceAt}s = ${(advanceAt / 60).toFixed(1)} 分钟`
    );
  } else {
    console.log(`⛔ ${Math.round(t)}s 内未满足全部跃迁条件`);
  }
  console.log('');
  console.log(`备注：末态谷物净产出 ${(s.grain > 0 ? '为正' : '为 0')}；人口上限 K 由村落民居与已耕作田地共同提供。`);
}

const args = process.argv.slice(1);
if (args.includes('autoplay')) {
  if (args.includes('e2')) {
    autoplayE2();
  } else {
    autoplay();
  }
} else {
  openingSim();
  console.log('提示：autoplay [beeline|focus] 跑 E1 自动试玩；autoplay e2 跑 E2 定居时代');
}
