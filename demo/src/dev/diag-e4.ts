// E4 定点诊断：观察 E4 起始状态与最初若干 tick 的数值变化
// 用法：node <tsx cli> src/dev/diag-e4.ts
//
// ⚠️ 不手工构造状态：手工构造漏掉 techs 会让 seasonsEnabled=false，
// 得出"粮仓失效"的假结论。必须走真实链式 E1→E2→E3 跃迁。
import { tick, getCapacity, getPopulationGrowth, aggregateEffects, getResourceStorage, getExpansionRequirement } from '../game/engine';
import { computeEraTransition } from '../game/transition';
import type { E1State } from '../game/engine';
import { autoplayForDiag } from './simulate';

const e3: E1State = autoplayForDiag();
console.log(`=== E3 末态（真实链式）===`);
console.log(`era=${e3.era} 人口=${Math.floor(e3.population)} 食物=${e3.food.toFixed(0)}`);
console.log(`粮仓=${e3.buildings.granary ?? 0} 田地=${e3.buildings.field ?? 0} 科技数=${Object.keys(e3.techs).length}`);
console.log(`E3 食物仓储上限=${getResourceStorage('food', e3)}`);

const t = computeEraTransition(e3, 'E4');
const s: E1State = {
  ...t,
  iron: 0,
  coin: 0,
  territory: 1,
  legions: 0,
  expansionPending: null,
  p1Unlocked: true,
  legacyPoints: 0,
};

console.log('=== E4 起始状态 ===');
console.log(`era=${s.era} 人口=${Math.floor(s.population)} 食物=${s.food.toFixed(0)}`);
console.log(`K=${getCapacity(s)} 火=${s.fire}`);
const eff = aggregateEffects(s);
console.log(`eff: seasonsEnabled=${eff.seasonsEnabled} fireEnabled=${eff.fireEnabled} scribesPerRoute=${eff.scribesPerRoute}`);
console.log(`食物仓储上限=${getResourceStorage('food', s)}`);
console.log(`人口增长率=${getPopulationGrowth(s).toFixed(4)}/秒`);
console.log(`岗位:`, JSON.stringify(s.jobs));
console.log(`下一格征伐要求:`, JSON.stringify(getExpansionRequirement(s)));

console.log('\n=== 前 20 个 tick（每 tick 0.25s）===');
for (let i = 0; i < 20; i++) {
  const r = tick(s, 0.25);
  Object.assign(s, r);
  console.log(
    `t=${((i + 1) * 0.25).toFixed(2)}s | 人口=${s.population.toFixed(1)} | 食物=${s.food.toFixed(0)} | 铁=${s.iron.toFixed(0)} | 铸币=${s.coin.toFixed(0)} | 军团=${s.jobs.legion ?? 0} | 知识=${s.experience.toFixed(0)}`
  );
}

console.log('\n=== 推进到 60s（每 5s 一行）===');
for (let i = 20; i < 240; i++) {
  const r = tick(s, 0.25);
  Object.assign(s, r);
  if (i % 20 === 19) {
    console.log(
      `t=${((i + 1) * 0.25).toFixed(0)}s | 人口=${s.population.toFixed(1)} | 食物=${s.food.toFixed(0)} | 铁=${s.iron.toFixed(0)} | 铸币=${s.coin.toFixed(0)} | 版图=${s.territory}`
    );
  }
}
