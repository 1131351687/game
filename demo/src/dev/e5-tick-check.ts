/**
 * E5 tick 接入的回归保护（一次性脚本，验收后可删）。
 *
 * 这是 T2 风险最高的一步：tick 是所有时代共用的。
 * 本脚本要证明三件事：
 *   1. 非 E5 时代，tick 不产生任何 E5 副作用（木/纸/典/银/研究点/识字率全不变）；
 *   2. 返回值的 E5 字段在非 E5 时代等于入参原值（透传，不被清零）；
 *   3. E5 时代里印刷链与复利确实运转。
 *
 * 用法（tsx 缺失时）：
 *   node .\node_modules\typescript\bin\tsc --outDir <tmp> --module commonjs \
 *        --target es2020 --moduleResolution node --skipLibCheck --esModuleInterop \
 *        src\dev\e5-tick-check.ts
 *   node <tmp>\dev\e5-tick-check.js
 */
import { tick } from '../game/engine';
import type { E1State as EraState } from '../game/engine';

let failures = 0;
function eq(label: string, actual: number, expected: number, tol = 1e-6): void {
  const ok = Math.abs(actual - expected) <= tol;
  if (!ok) failures++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}: ${actual} (expected ${expected})`);
}
function ok(label: string, cond: boolean): void {
  if (!cond) failures++;
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${label}`);
}
function eqStr(label: string, actual: string, expected: string): void {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`);
}

/** 造一个指定时代的最小可用状态 */
function mk(era: string, over: any = {}): EraState {
  return {
    era,
    food: 5000, wood: 5000, stone: 5000, experience: 0,
    livestock: 0, fabric: 0, eraElapsedSec: 0,
    copper: 0, tin: 0, bronze: 0, lapis: 0, iron: 0, coin: 0,
    territory: 1, legions: 0, expansionPending: null,
    p1Unlocked: false, legacyPoints: 0,
    recorded: [], recordedOnce: [],
    tradeRoutes: [], reputation: 50,
    population: 10, populationProgress: 0, fire: 50,
    jobs: {}, buildings: {}, techs: {},
    autoMaintainFire: false,
    // E5 字段：给非零原值，用来检测"是否被意外清零"
    paper: 111, books: 222, silver: 333, researchPoints: 444,
    exoticGoods: 555, literacy: 12, voyages: [], loan: 0,
    ...over,
  } as unknown as EraState;
}

console.log('=== 非 E5 时代：E5 字段必须原样透传（不被清零）===');
for (const era of ['E1', 'E2', 'E3', 'E4']) {
  const s = mk(era, { jobs: { gatherer: 5, woodcutter: 3 }, buildings: { hearth: 1 } });
  const r: any = tick(s, 0.25, () => 0.5, 1000);
  eq(`${era} paper 透传`, r.paper, 111);
  eq(`${era} books 透传`, r.books, 222);
  eq(`${era} silver 透传`, r.silver, 333);
  eq(`${era} researchPoints 透传`, r.researchPoints, 444);
  eq(`${era} exoticGoods 透传`, r.exoticGoods, 555);
  eq(`${era} literacy 透传`, r.literacy, 12);
  eq(`${era} loan 透传`, r.loan, 0);
  eq(`${era} voyages 数量不变`, r.voyages.length, 0);
  eqStr(`${era} printNote 为空`, r.printNote, '');
  eq(`${era} voyageNotes 为空`, r.voyageNotes.length, 0);
}

console.log('\n=== 非 E5 时代：木材不被造纸工吃掉 ===');
//
// ⚠️ 必须与「同样配置但没有印刷岗位」的对照跑对比。
//    直接断言 wood >= 1000 是错的 —— tickFire 的自动维持会消耗木材，
//    那是 E1 的火种系统，与印刷链无关。只有差值才说明印刷链是否插手。
for (const era of ['E1', 'E2', 'E3', 'E4']) {
  const common = {
    wood: 1000,
    jobs: { woodcutter: 4 },
    buildings: {} as Record<string, number>,
    techs: {},
  };
  const control = mk(era, { ...common, buildings: {} });
  const withPrinters = mk(era, {
    ...common,
    jobs: { woodcutter: 4, papermaker: 6, printer: 8, scholar: 5 },
    buildings: { paper_mill: 1, printing_workshop: 1, university: 1 },
  });
  const rc: any = tick(control, 0.25, () => 0.5, 1000);
  const rp: any = tick(withPrinters, 0.25, () => 0.5, 1000);

  eq(`${era} 纸张未被生产`, rp.paper, 111);
  eq(`${era} 典籍未被生产`, rp.books, 222);
  eq(`${era} 研究点未被生产`, rp.researchPoints, 444);
  eq(`${era} 木材消耗与无印刷岗位时完全一致`, rp.wood, rc.wood);
}

console.log('\n=== E5 时代：印刷链确实运转 ===');
const e5 = mk('E5', {
  wood: 10000, paper: 0, books: 0, researchPoints: 0,
  jobs: { woodcutter: 10, papermaker: 6, printer: 8, scholar: 5, teacher: 1 },
  buildings: { paper_mill: 1, printing_workshop: 1, university: 1 },
  techs: { printing: true, papermaking: true },
  population: 100,
});
const t1: any = tick(e5, 1.0, () => 0.5, 1000);
ok(`E5 纸张产出（${t1.paper.toFixed(2)} > 0）`, t1.paper > 0);
ok(`E5 典籍产出（${t1.books.toFixed(2)} > 0）`, t1.books > 0);
ok(`E5 木材被消耗（${t1.wood.toFixed(1)} < 10000）`, t1.wood < 10000);
ok(`E5 识字率上升（${t1.literacy.toFixed(4)} > 12）`, t1.literacy > 12);
// 冷启动第一 tick 学者无书可读 —— 这是**设计意图**（忍耐期），不是 bug。
// 印刷链需要时间自下而上把料填满：木 → 纸 → 典 → 研究点。
eq('冷启动首 tick 研究点仍为 0（典籍尚未积累）', t1.researchPoints, 0);
ok(`首 tick 已产出的典籍在积累（${t1.books.toFixed(2)} > 0）`, t1.books > 0);

console.log('\n=== 忍耐期：链条需要时间填满，之后研究点开始产出 ===');
let s: any = mk('E5', {
  wood: 100000, paper: 0, books: 0, researchPoints: 0,
  jobs: { woodcutter: 30, papermaker: 6, printer: 8, scholar: 5, teacher: 1 },
  buildings: { paper_mill: 1, printing_workshop: 1, university: 1 },
  techs: { printing: true, papermaking: true },
  population: 100,
});
const trace: number[] = [];
for (let i = 0; i < 12; i++) {
  const r: any = tick(s, 1.0, () => 0.5, 1000);
  // 把 tick 结果写回状态（模拟 store 的职责）
  s = { ...s, ...r, jobs: s.jobs, buildings: s.buildings, techs: s.techs };
  trace.push(r.researchPoints);
}
console.log(`[INFO] 研究点轨迹（每秒）：${trace.map(v => v.toFixed(1)).join(', ')}`);
ok('研究点随时间单调增长', trace.every((v, i) => i === 0 || v >= trace[i - 1] - 1e-9));
ok('最终确实在产出研究点', trace[trace.length - 1] > 0);
ok(`典籍已积累（${s.books.toFixed(1)}）`, s.books > 0);

// 基准：无科技（R=1）、识字率 12%（因子 0.772）时，学者仍必须产出。
// 5 学者 × 2.0 = 10/秒；×1×0.772 = 7.72/秒。
console.log('=== 基础产出不得为零（曾因只加增量而全丢）===');
const bare = mk('E5', {
  wood: 10000, paper: 10000, books: 10000, researchPoints: 0,
  jobs: { papermaker: 6, printer: 8, scholar: 5 },
  buildings: { paper_mill: 1, printing_workshop: 1, university: 1 },
  techs: {}, // 无印刷术 → R = 1
  population: 100,
});
const tb: any = tick(bare, 1.0, () => 0.5, 1000);
console.log(`[INFO] 无科技时研究点 = ${tb.researchPoints.toFixed(4)}（期望 ≈ 10 × 0.772 = 7.72）`);
ok('无科技时学者仍产出研究点（基础产出未丢失）', tb.researchPoints > 0);
ok('基础产出接近 10×0.772', Math.abs(tb.researchPoints - 7.72) < 0.5);
ok('研究点绝不为负', tb.researchPoints > 0);

console.log('\n=== E5 复利生效：科技越多，研究点产出越高 ===');
const base = {
  wood: 100000, paper: 100000, books: 100000, researchPoints: 0,
  jobs: { papermaker: 6, printer: 8, scholar: 5 },
  buildings: { paper_mill: 1, printing_workshop: 1, university: 1 },
  population: 100,
};
const few = tick(mk('E5', { ...base, techs: { printing: true, papermaking: true } }), 1.0, () => 0.5, 1000) as any;
const many = tick(mk('E5', {
  ...base,
  techs: {
    printing: true, papermaking: true, movable_type: true, university_system: true,
    compass: true, gunpowder: true, rag_paper: true, water_powered_pulp: true,
    alloy_type: true, university_charter: true, secular_schools: true,
    vernacular_printing: true, scholarship: true, workshop_division: true,
  },
}), 1.0, () => 0.5, 1000) as any;
console.log(`[INFO] 2 项科技研究点 = ${few.researchPoints.toFixed(2)}`);
console.log(`[INFO] 14 项科技研究点 = ${many.researchPoints.toFixed(2)}`);
ok('科技变多 → 研究点产出变高（复利生效）', many.researchPoints > few.researchPoints);

console.log('\n=== E5 远航：未解锁时不推进 ===');
const noCompass = mk('E5', {
  ...base, techs: { printing: true },
  voyages: [{ ring: 2, progress: 0, target: 180, sailors: 12, newWorldFound: false }],
  jobs: { sailor: 12 },
});
const nc: any = tick(noCompass, 1.0, () => 0.5, 1000);
eq('无指南针 → 进度不动', nc.voyages[0].progress, 0);

const withCompass = mk('E5', {
  ...base, techs: { printing: true, compass: true },
  voyages: [{ ring: 2, progress: 0, target: 180, sailors: 12, newWorldFound: false }],
  jobs: { sailor: 12 },
});
const wc: any = tick(withCompass, 1.0, () => 0.5, 1000);
ok(`有指南针 → 进度推进（${wc.voyages[0].progress.toFixed(2)} > 0）`, wc.voyages[0].progress > 0);

console.log('\n=== E5 远航完航后重新出海（船队不消失）===');
const almost = mk('E5', {
  ...base, techs: { printing: true, compass: true },
  voyages: [{ ring: 2, progress: 179.5, target: 180, sailors: 12, newWorldFound: false }],
  jobs: { sailor: 12 },
});
const done: any = tick(almost, 1.0, () => 0.0, 1000); // rng=0 → 发现新大陆
eq('完航后船队仍在', done.voyages.length, 1);
eq('进度已归零重新出海', done.voyages[0].progress, 0);
ok('新大陆标记已置位', done.voyages[0].newWorldFound === true);
ok('产出了运航消息', done.voyageNotes.length > 0);
console.log(`[INFO] 消息：${done.voyageNotes.join(' | ')}`);
ok(`新大陆奖励已发放（异域物产 ${done.exoticGoods} > 555）`, done.exoticGoods > 555);
ok(`新大陆奖励已发放（白银 ${done.silver.toFixed(0)} > 333）`, done.silver > 333);

console.log('\n=== 确定性：同状态同 rng → 同结果 ===');
const s1: any = tick(almost, 1.0, () => 0.0, 1000);
const s2: any = tick(almost, 1.0, () => 0.0, 1000);
eq('研究点一致', s1.researchPoints, s2.researchPoints);
eq('白银一致', s1.silver, s2.silver);
eq('异域物产一致', s1.exoticGoods, s2.exoticGoods);

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`);
