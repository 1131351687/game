/**
 * E5 识字率 / 远航 / 银行 边界验算（一次性脚本，验收后可删）。
 *
 * 用法（tsx 缺失时）：
 *   node .\node_modules\typescript\bin\tsc --outDir <tmp> --module commonjs \
 *        --target es2020 --moduleResolution node --skipLibCheck --esModuleInterop \
 *        src\dev\e5-misc-check.ts
 *   node <tmp>\dev\e5-misc-check.js
 */
import {
  getLiteracyUpperBound, getPrintCapacityFactor, getLiteracyFactor,
  tickLiteracy, LITERACY_FACTOR_MIN, LITERACY_FACTOR_MAX,
} from '../game/e5/literacy';
import {
  RING1_EVENTS, RING2_EVENTS, RING3_EVENTS, rollVoyageEvent,
  advanceVoyage, createVoyage, getVoyageCost, getVoyageCapacity, ringName,
} from '../game/e5/voyage';
import {
  LOAN_LIMIT, getLoanCapacity, borrow, repay, tickBank, getLoanWarning,
} from '../game/e5/bank';
import { E5 } from '../data/constants';

let failures = 0;
function eq(label: string, actual: number, expected: number, tol = 1e-9): void {
  const ok = Math.abs(actual - expected) <= tol;
  if (!ok) failures++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}: ${actual} (expected ${expected})`);
}
function eqStr(label: string, actual: string, expected: string): void {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}: ${actual} (expected ${expected})`);
}
function ok(label: string, cond: boolean): void {
  if (!cond) failures++;
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${label}`);
}

console.log('=== §11.3 识字率上限 ===');
eq('无大学上限 15%', getLiteracyUpperBound(0, 0), 0.15);
eq('1 座大学 → 30%', getLiteracyUpperBound(1, 0), 0.30);
eq('5 座大学 → 90%', getLiteracyUpperBound(5, 0), 0.90);
eq('硬顶 95%（6 座也不超）', getLiteracyUpperBound(6, 0), 0.95);
eq('硬顶 95%（10 座）', getLiteracyUpperBound(10, 0), 0.95);
eq('科技加成可顶到硬顶但不超过', getLiteracyUpperBound(3, 0.6), 0.95);

console.log('\n=== §11.3 识字率因子 ===');
eq('lit=0 → 0.70', getLiteracyFactor(0), 0.70);
eq('lit=1 → 1.30', getLiteracyFactor(1), 1.30);
eq('lit=0.5 → 1.00', getLiteracyFactor(0.5), 1.00);
eq('起始 12% → 0.772', getLiteracyFactor(0.12), 0.772);
eq('越界被裁（负）', getLiteracyFactor(-5), 0.70);
eq('越界被裁（>1）', getLiteracyFactor(5), 1.30);
eq('常量自洽 MIN', LITERACY_FACTOR_MIN, E5.LITERACY_FACTOR_BASE);
eq('常量自洽 MAX', LITERACY_FACTOR_MAX, E5.LITERACY_FACTOR_BASE + E5.LITERACY_FACTOR_SLOPE);

console.log('\n=== 印刷产能因子 ===');
eq('典籍产能 0 → 因子 0.5（不是 0）', getPrintCapacityFactor(0), 0.5);
eq('典籍产能 1.0 → 0.75', getPrintCapacityFactor(1.0), 0.75);
eq('典籍产能 2.0 → 饱和 1.0', getPrintCapacityFactor(2.0), 1.0);
eq('典籍产能 10 → 仍 1.0', getPrintCapacityFactor(10), 1.0);

console.log('\n=== 识字率增长是逻辑斯谛的 ===');
// 起始 12%，无大学（上限 15%），典籍充足，有教师
let lit = 12;
const cap = getLiteracyUpperBound(0, 0) * 100; // 15
let steps = 0;
while (lit < cap - 1e-9 && steps < 100000) {
  lit = tickLiteracy(lit, 1, 5, 1, 0, 0);
  steps++;
}
eq('最终收敛到上限', lit, cap, 1e-6);
ok(`收敛需要有限步（${steps} 秒）`, steps > 0 && steps < 100000);
console.log(`[INFO] 12% → 15%（1 教师，典籍充足）耗时约 ${steps} 秒`);

// 永不越过上限
lit = 14.999;
const after = tickLiteracy(lit, 100, 5, 1, 0, 0);
ok('单次大步长不越过上限', after <= cap + 1e-9);
eq('已在上限则保持不变', tickLiteracy(cap, 100, 5, 1, 0, 0), cap);

// 单调不减
let prev = 0; let mono = true;
for (let i = 0; i < 200; i++) {
  const cur = tickLiteracy(i * 0.05, 1, 5, 1, 0, 0);
  if (cur < prev - 1e-12) mono = false;
  prev = cur;
}
ok('识字率单调不减（不会遗忘）', mono);

// 教师加速
const noTeacher = tickLiteracy(12, 10, 5, 0, 0, 0);
const withTeacher = tickLiteracy(12, 10, 5, 1, 0, 0);
ok('教师让增长更快', withTeacher > noTeacher);
eq('教师乘数 ≈ 1.3', (withTeacher - 12) / (noTeacher - 12), E5.LITERACY_TEACHER_MUL, 1e-6);

console.log('\n=== §11.6 远航：权重表合计 100 ===');
for (const [name, table] of [['第1环', RING1_EVENTS], ['第2环', RING2_EVENTS], ['第3环', RING3_EVENTS]] as const) {
  const total = table.reduce((s, e) => s + e.w, 0);
  eq(`${name} 权重合计`, total, 100);
}

console.log('\n=== 第 2 环事件核对设计文档 §13 ===');
const r2: Record<string, number> = {};
for (const e of RING2_EVENTS) r2[e.make().label] = e.w;
eq('发现新大陆 18%', r2['发现新大陆'], 18);
eq('香料海岸 15%', r2['香料海岸'], 15);
eq('顺风 14%', r2['顺风'], 14);
eq('风暴 12%', r2['风暴'], 12);
eq('原住民接触 10%', r2['原住民接触'], 10);
eq('船员病疫 8%', r2['船员病疫'], 8);
eq('沉船 8%', r2['沉船'], 8);
eq('古代典籍 6%', r2['古代典籍'], 6);
eq('海图残页 5%', r2['海图残页'], 5);
eq('黄金国传说 3%', r2['黄金国传说'], 3);
eq('环球航线 1%', r2['环球航线'], 1);

console.log('\n=== 事件抽取的确定性（autoplay 复现的前提）===');
// 同一个固定序列必须给出同一个结果
function fixedSeq(values: number[]) { let i = 0; return () => values[i++ % values.length]; }
const a = rollVoyageEvent(2, fixedSeq([0.0])) ?.label;
const b = rollVoyageEvent(2, fixedSeq([0.0])) ?.label;
eqStr('同序列同结果', String(a), String(b));
eqStr('rng=0 → 首个事件（发现新大陆）', String(rollVoyageEvent(2, fixedSeq([0.0])).label), '发现新大陆');
eqStr('rng=0.99 → 末个事件（环球航线）', String(rollVoyageEvent(2, fixedSeq([0.99])).label), '环球航线');
// 边界不崩
for (const v of [0, 0.5, 0.999999, 1]) {
  const out = rollVoyageEvent(2, fixedSeq([v]));
  ok(`rng=${v} 抽出有效事件（${out.label}）`, !!out && typeof out.label === 'string');
}

console.log('\n=== 新大陆里程碑标记 ===');
const nw = rollVoyageEvent(2, fixedSeq([0.0]));
ok('发现新大陆带 newWorld 标记', nw.newWorld === true);
ok('第 1 环不会有新大陆', RING1_EVENTS.every(e => !e.make().newWorld));

console.log('\n=== 船队建成与推进 ===');
const v = createVoyage(2);
eq('第 2 环 target = 180s', v.target, 180);
eq('第 2 环水手 12', v.sailors, 12);
eq('第 1 环 target = 60s', createVoyage(1).target, 60);
eq('第 3 环 target = 480s', createVoyage(3).target, 480);
eq('初始进度 0', v.progress, 0);

// 12 水手，无加成，识字率 0 → 12 进度/秒 → 15 秒走完 180
const r1 = advanceVoyage({ ring: 2, progress: 0, target: 180, newWorldFound: false }, 15, 12, 0, 0);
eq('12 水手 ×15s = 180 进度', r1.progress, 180);
ok('15 秒刚好达成', r1.completed);
const r2b = advanceVoyage({ ring: 2, progress: 0, target: 180, newWorldFound: false }, 14, 12, 0, 0);
ok('14 秒未达成', !r2b.completed);

// 识字率加成：lit=1 → +0.10
const rHigh = advanceVoyage({ ring: 2, progress: 0, target: 180, newWorldFound: false }, 10, 12, 0, 1);
eq('满识字率 → 12×1.1×10', rHigh.progress, 132);

console.log('\n=== 物料成本核对 §11.6 ===');
const c1 = getVoyageCost(1), c2 = getVoyageCost(2), c3 = getVoyageCost(3);
eq('第1环 木', c1.wood, 40); eq('第1环 铁', c1.iron, 20);
eq('第2环 木', c2.wood, 120); eq('第2环 铁', c2.iron, 60); eq('第2环 银', c2.silver, 50);
eq('第3环 木', c3.wood, 300); eq('第3环 铁', c3.iron, 150); eq('第3环 银', c3.silver, 200);

console.log('\n=== 单次远航净收益为负（设计意图）===');
// 第2环期望白银 = 15%×150 + 18%×300(新大陆首通) ... 但沉船返还 8%×50%×50
const expectedSilver = 0.15 * 150 + 0.08 * 0.5 * 50; // 香料海岸 + 沉船返还
console.log(`[INFO] 第2环非首通常规期望白银 ≈ ${expectedSilver.toFixed(1)}（成本 50）`);
ok('常规期望收益 < 成本（出海不划算）', expectedSilver < c2.silver);

console.log('\n=== 船队容量 ===');
eq('无港 → 0 支', getVoyageCapacity(0), 0);
eq('3 港 → 3 支', getVoyageCapacity(3), 3);
eqStr('环名 1', ringName(1), '近海');
eqStr('环名 2', ringName(2), '远洋');
eqStr('环名 3', ringName(3), '环球');

console.log('\n=== 银行与信贷 ===');
eq('未解锁额度 0', getLoanCapacity(0, false), 0);
eq('解锁后满额度', getLoanCapacity(0, true), LOAN_LIMIT);
eq('已借 500 → 剩 1500', getLoanCapacity(500, true), 1500);
eq('借满后额度 0', getLoanCapacity(LOAN_LIMIT, true), 0);

let bk = borrow(0, 500, true);
eq('借 500 → 贷款 500', bk.loan, 500);
eq('到手 500', bk.gained, 500);
bk = borrow(1800, 500, true);
eq('超额度只借到 200', bk.gained, 200);
eq('贷款封顶 2000', bk.loan, LOAN_LIMIT);
eq('未解锁借不到', borrow(0, 500, false).gained, 0);

let rp = repay(500, 1000, 200);
eq('正常还款', rp.loan, 300);
eq('扣银 200', rp.spent, 200);
rp = repay(500, 50, 200);
eq('银不够只还 50', rp.loan, 450);
eq('扣银 50', rp.spent, 50);
rp = repay(100, 1000, 500);
eq('不会还成负数', rp.loan, 0);
eq('最多只扣本金', rp.spent, 100);

eq('无贷款利息为 0', tickBank(0, 100), 0);
const grew = tickBank(1000, 50);
eq('50 秒后利息 1%', grew, 1000 * 1.01, 1e-9);
ok('利息让贷款变多', grew > 1000);

eqStr('无贷款无警告', getLoanWarning(0, true), 'none');
eqStr('贷款 1200 高警告', getLoanWarning(1200, true), 'high');
eqStr('贷款满额警告', getLoanWarning(LOAN_LIMIT, true), 'maxed');
eqStr('未解锁无警告', getLoanWarning(1000, false), 'none');

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`);
