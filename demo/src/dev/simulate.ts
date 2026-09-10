// 配平验证 / 自动试玩
//
// 用法：
//   npx tsx src/dev/simulate.ts           仅跑开局模拟
//   npx tsx src/dev/simulate.ts autoplay  跑 20 分钟自动试玩
//
// 用途：改数值后快速看曲线，不用开浏览器。

import { tick, canResearch, isTechAvailable, calcExperienceOutput } from '../game/engine';
import type { E1State } from '../game/engine';
import { TECHS } from '../data/techs';
import { POPULATION } from '../data/constants';

function makeState(): E1State {
  return {
    food: 20,
    wood: 10,
    stone: 0,
    experience: 0,
    population: POPULATION.START,
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
  s.population = r.population;
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
function autoplay(totalSec = 1200): void {
  const s = makeState();
  const researched: string[] = [];

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

  // 两种研究策略：
  //   greedy = 贪心买最便宜的（广度优先，会拖慢门槛）
  //   focus  = 先走通「火之技艺」分支再直取门槛（符合设计意图的专注打法）
  // 注：tsx 的 argv 布局与 node 不同，故扫描全部参数而非按固定下标取值
  const args = process.argv.slice(1);
  const strategy = args.includes('focus') ? 'focus' : 'greedy';
  const FIRE_BRANCH = ['fire_starting', 'cooking', 'hearth_construction', 'hot_rock_cooking', 'torch', 'fire_preservation'];

  const autoResearch = (): void => {
    const cands = TECHS.filter(
      t => !s.techs[t.id] && isTechAvailable(t.id, s) && canResearch(t.id, s).ok
    );
    if (cands.length === 0) return;

    let pick;
    if (strategy === 'focus') {
      // 优先级：火之技艺分支 → 门槛科技 → 其余
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
  const log: string[] = [];

  for (let t = 0; t < totalSec; t += 0.25) {
    advance(s, 0.25);
    autoAssign();
    autoResearch();
    autoBuild();

    if (marks.includes(Math.round(t))) {
      log.push(
        `  ${String(Math.round(t)).padStart(4)}s | 人口 ${s.population.toFixed(1).padStart(4)} | ` +
          `食物 ${s.food.toFixed(0).padStart(4)} | 木 ${s.wood.toFixed(0).padStart(3)} | ` +
          `火 ${s.fire.toFixed(0).padStart(3)} | 经验 ${s.experience.toFixed(0).padStart(5)} | ` +
          `科技 ${String(researched.length).padStart(2)}/20 | 住所 ${s.buildings.house}`
      );
    }
  }

  console.log('=== 自动试玩（20 分钟，模拟"还算聪明"的玩家）===\n');
  console.log(log.join('\n'));
  console.log('');
  console.log(`完成研究 ${researched.length}/20 项：`);
  console.log('  ' + researched.join(' → '));
  console.log('');
  console.log(`经验产出速率（末态）: ${calcExperienceOutput(s).toFixed(2)}/秒`);
  if (s.techs['plant_cultivation']) {
    console.log('✅ 已达成门槛科技「植物栽培」');
  } else {
    console.log('❌ 未达成门槛科技「植物栽培」—— 配平偏紧');
  }
}

const args = process.argv.slice(1);
if (args.includes('autoplay')) {
  autoplay();
} else {
  openingSim();
  console.log('提示：加 autoplay 参数跑 20 分钟自动试玩；再加 focus 使用专注策略');
}
