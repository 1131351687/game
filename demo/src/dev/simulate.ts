// 临时验证脚本：模拟开局 120 秒，确认人口不会无故死亡
// 运行：npx tsx src/_simcheck.ts
import { tick } from '../game/engine';
import type { E1State } from '../game/engine';

function makeState(): E1State {
  return {
    food: 20,
    wood: 10,
    stone: 0,
    experience: 0,
    population: 2,
    fire: 0,
    jobs: { gatherer: 0, woodcutter: 0, knapper: 0, hunter: 0 },
    buildings: { house: 0, hearth: 0, workshop: 0 },
    techs: {},
    autoMaintainFire: true,
  };
}

function run(label: string, assignGatherers: number) {
  const s = makeState();
  s.jobs.gatherer = assignGatherers;
  const dt = 0.25;
  let minPop = s.population;
  for (let t = 0; t < 120; t += dt) {
    const r = tick(s, dt);
    s.food = r.food;
    s.wood = r.wood;
    s.stone = r.stone;
    s.experience = r.experience;
    s.population = r.population;
    s.fire = r.fire;
    minPop = Math.min(minPop, s.population);
  }
  console.log(
    `${label}\n` +
      `  120秒后: 人口 ${s.population.toFixed(2)} (最低 ${minPop.toFixed(2)}) | ` +
      `食物 ${s.food.toFixed(1)} | 经验 ${s.experience.toFixed(1)}\n`
  );
}

console.log('=== 开局模拟（120 秒）===\n');
run('【不派采集者】', 0);
run('【派 2 个采集者】', 2);
