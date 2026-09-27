/**
 * E5 复利边界验算（一次性脚本，验收后可删）。
 *
 * 依据 design/game/eras/E5-devplan.md §三 T2：
 *   在写进引擎之前，先用纯函数把数值边界钉死。
 *
 * ⚠️ 这个脚本不 import 引擎，只 import 纯函数 + 数据表，
 *    因此可以在没有 jsdom / zustand 的环境下直接跑。
 *
 * 用法（tsx 缺失时）：
 *   node .\node_modules\typescript\bin\tsc --outDir <tmp> --module commonjs \
 *        --target es2020 --moduleResolution node --skipLibCheck --esModuleInterop \
 *        src\dev\e5-compound-check.ts
 *   node <tmp>\dev\e5-compound-check.js
 */
import { getNeff, getCompoundK, getCompoundMultiplier } from '../game/e5/compound';
import { E5 } from '../data/constants';
import type { EraState } from '../game/engine';

let failures = 0;
function eq(label: string, actual: number, expected: number, tol = 1e-9): void {
  const ok = Math.abs(actual - expected) <= tol;
  if (!ok) failures++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}: ${actual} (expected ${expected})`);
}

/** 造一个最小的 EraState 替身，只为复利函数服务 */
function fakeState(era: string, techIds: string[]): EraState {
  const techs: Record<string, boolean> = {};
  for (const id of techIds) techs[id] = true;
  return { era, techs } as unknown as EraState;
}

/** 真实的 35 项 E5 科技 id（按依赖顺序大致排列，顺序对 N 无影响） */
const E5_IDS = [
  'printing', 'papermaking', 'movable_type', 'university_system', 'compass', 'gunpowder',
  'rag_paper', 'water_powered_pulp', 'alloy_type', 'university_charter', 'secular_schools',
  'vernacular_printing', 'scholarship', 'workshop_division', 'public_library',
  'proofreading_pagination', 'oil_ink', 'printers_guild', 'double_press',
  'celestial_navigation', 'caravel', 'astrolabe_quadrant', 'logbook', 'lateen_sail',
  'telescope', 'colonial_outpost', 'circumnavigation',
  'double_entry_bookkeeping', 'anatomy', 'bank_credit', 'new_crops',
  'mining_blasting', 'heliocentrism', 'scientific_method', 'steam_engine',
];
console.log(`[INFO] E5 科技 id 总数 = ${E5_IDS.length}（应为 35）`);
if (E5_IDS.length !== 35) failures++;

console.log('\n=== §11.2 N_eff 分段 ===');
eq('N_eff(0)', getNeff(0), 0);
eq('N_eff(20) 第一段顶点', getNeff(20), 20);
eq('N_eff(21) 第二段开始', getNeff(21), 20.5);
eq('N_eff(30)', getNeff(30), 25);
eq('N_eff(35) 第二段顶点', getNeff(35), 27.5);
eq('N_eff(36) 第三段', getNeff(36), 27.75);
eq('N_eff(100) 撞硬上限', getNeff(100), E5.NEFF_CAP);
const capAt = (() => {
  for (let n = 0; n <= 500; n++) if (getNeff(n) >= E5.NEFF_CAP) return n;
  return -1;
})();
console.log(`[INFO] N_eff 达到硬上限 ${E5.NEFF_CAP} 的最小 N = ${capAt}`);

console.log('\n=== §11.2 复利系数 k ===');
eq('k(无加成)', getCompoundK({ compoundKAdd: 0 }), 0.05);
eq('k(全点满 +0.05)', getCompoundK({ compoundKAdd: 0.05 }), 0.1);
eq('k 超上限被裁到 0.10', getCompoundK({ compoundKAdd: 0.99 }), 0.1);
eq('k 负值被保底 0', getCompoundK({ compoundKAdd: -1 }), 0);

console.log('\n=== §11.2 复利倍率 R ===');
const kFull = { compoundKAdd: 0.05 }; // k = 0.10
const s20 = fakeState('E5', E5_IDS.slice(0, 20));
eq('N=20 时计数正确', getCompoundMultiplier(s20, kFull), 3.0);
const s10 = fakeState('E5', E5_IDS.slice(0, 10));
eq('N=10 → R = 1 + 0.10×10', getCompoundMultiplier(s10, kFull), 2.0);
const sAll = fakeState('E5', E5_IDS);
// N=35 → N_eff=27.5 → R = 1 + 0.10×27.5 = 3.75
eq('N=35 → N_eff 27.5 → R 3.75', getCompoundMultiplier(sAll, kFull), 3.75);
// 理论上限：k=0.10、N_eff=32 → 4.20，恰好等于硬顶
eq('理论最大值 = 硬顶 4.20', 1 + 0.1 * E5.NEFF_CAP, E5.COMPOUND_R_CAP);

console.log('\n=== 时代门控（关键回归保护）===');
for (const era of ['E1', 'E2', 'E3', 'E4', 'E6', 'E7']) {
  eq(`R 在 ${era} 恒为 1`, getCompoundMultiplier(fakeState(era, E5_IDS), kFull), 1);
}

console.log('\n=== 闸门一：N 跨代归零 ===');
// 已解锁一堆 E4 科技，但时代是 E5 → 它们不计入 N
const e4Only = fakeState('E5', ['steel', 'iron_tools', 'heavy_plow', 'coinage', 'minting']);
eq('E4 科技不计入 E5 的 N', getCompoundMultiplier(e4Only, kFull), 1);
// 反过来：E5 科技在 E6 里也不计（时代门控优先）
const e5InE6 = fakeState('E6', E5_IDS);
eq('E5 科技在 E6 时 R 仍为 1', getCompoundMultiplier(e5InE6, kFull), 1);

console.log('\n=== 单调性：每多一项科技，R 只增不减 ===');
let prev = -1;
let monotonic = true;
for (let n = 0; n <= 35; n++) {
  const r = getCompoundMultiplier(fakeState('E5', E5_IDS.slice(0, n)), kFull);
  if (r < prev - 1e-12) monotonic = false;
  prev = r;
}
console.log(`[${monotonic ? 'PASS' : 'FAIL'}] N 从 0→35，R 单调不减`);
if (!monotonic) failures++;

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`);
