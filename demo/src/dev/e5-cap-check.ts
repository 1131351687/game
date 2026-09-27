/**
 * E5 知识复利 **上限安全性** 检查。
 *
 * 结论先行：E5 只有 35 项本时代科技，全部解开时 N=35 → N_eff=27.5 → R=3.75。
 * 因此 ×4.20 硬顶在正常玩法下**永远摸不到**，它是纯粹的安全网
 * （COMPOUND_R_CAP 的意义就是"任何合法数据都不该突破它"）。
 * N_eff=32（→ R=4.20）需要 N=53，而 E5 没有那么多科技。
 *
 * 本脚本同时验证：
 *   · R 单调不减（科技只增不减）
 *   · R 永不突破 4.20（含人为灌入超大 k 的暴力测试）
 *   · k 被钳制在 0.10 以内
 */
import { getCompoundMultiplier, getCompoundBreakdown, getNeff, getCompoundK } from '../game/e5/compound';
import { TECHS } from '../data/techs';
import type { E1State } from '../game/engine';
import { E5 } from '../data/constants';

const e5 = TECHS.filter(t => t.era === 'E5');
let f = 0;
const ok = (l: string, c: boolean) => { if (!c) f++; console.log(`[${c ? 'PASS' : 'FAIL'}] ${l}`); };

function mk(n: number): E1State {
  const techs: Record<string, boolean> = {};
  for (const t of TECHS) if (t.era !== 'E5') techs[t.id] = true;
  for (let i = 0; i < n && i < e5.length; i++) techs[e5[i].id] = true;
  return { era: 'E5', techs, buildings: {}, jobs: {} } as unknown as E1State;
}
const effWith = (kAdd: number) => ({ compoundKAdd: kAdd } as never);

console.log(`E5 本时代科技总数：${e5.length}\n`);

// ── 1. 真实可达上限 ──
console.log('── 真实可达范围 ──');
let maxR = 0;
for (let n = 0; n <= e5.length; n++) {
  maxR = Math.max(maxR, getCompoundMultiplier(mk(n), effWith(E5.COMPOUND_K_MAX_BONUS)));
}
console.log(`满科技 N=${e5.length} 时 R = ${maxR.toFixed(4)}`);
ok('满科技 R = 3.75（N=35 → N_eff=27.5 → 1 + 0.10×27.5）', Math.abs(maxR - 3.75) < 1e-9);
ok('满科技 R 低于 4.20 硬顶（硬顶是安全网，非常规上限）', maxR < E5.COMPOUND_R_CAP);
ok('基准态 N=0 → R = 1.00（复利不凭空产生）', getCompoundMultiplier(mk(0), effWith(E5.COMPOUND_K_MAX_BONUS)) === 1);

// ── 2. 单调不减 ──
console.log('\n── 单调性 ──');
let monotone = true, prev = 0;
for (let n = 0; n <= e5.length; n++) {
  const r = getCompoundMultiplier(mk(n), effWith(E5.COMPOUND_K_MAX_BONUS));
  if (r < prev - 1e-12) monotone = false;
  prev = r;
}
ok('R 随科技数单调不减（不会因多点科技而变小）', monotone);

// ── 3. 暴力测试：硬顶必须挡得住 ──
console.log('\n── 硬顶压力测试 ──');
const brute = getCompoundMultiplier(mk(e5.length), effWith(999));
ok('k 被钳制：灌入 999 后 R 仍 ≤ 4.20', brute <= E5.COMPOUND_R_CAP + 1e-9);
console.log(`   灌入 k 加成 999 → R = ${brute.toFixed(4)}`);
const kBrute = getCompoundK({ compoundKAdd: 999 } as never);
ok('getCompoundK 钳制到 0.10', Math.abs(kBrute - 0.10) < 1e-9);
ok('getCompoundK 不会低于 0', getCompoundK({ compoundKAdd: -5 } as never) >= 0);

// ── 4. N_eff 分段曲线 ──
console.log('\n── N_eff 分段 ──');
ok('N=0 → N_eff=0', getNeff(0) === 0);
ok('N=20 → N_eff=20（第一段末端）', getNeff(20) === 20);
ok('N=21 → N_eff=20.5（第二段斜率 0.5）', getNeff(21) === 20.5);
ok('N=35 → N_eff=27.5（第二段末端）', getNeff(35) === 27.5);
ok('N=36 → N_eff=27.75（第三段斜率 0.25）', Math.abs(getNeff(36) - 27.75) < 1e-9);
ok('N=53 → N_eff=32（硬顶达成点）', getNeff(53) === 32);
ok('N=200 → N_eff=32（封顶后不再增长）', getNeff(200) === 32);

const b = getCompoundBreakdown(mk(e5.length), effWith(E5.COMPOUND_K_MAX_BONUS));
console.log(`   查证：N=${b.n} N_eff=${b.nEff} k=${b.k} R=${b.r.toFixed(4)} capped=${b.capped}`);
ok('N=35 时未触发 capped（因为还没到硬顶）', b.capped === false);

// ── 5. 非 E5 时代返回中性值 ──
console.log('\n── 时代门控 ──');
for (const era of ['E1', 'E2', 'E3', 'E4', 'E6', 'E7', 'E8']) {
  const s = { ...mk(e5.length), era } as unknown as E1State;
  ok(`${era} 复利一律中性 ×1.00`, getCompoundMultiplier(s, effWith(E5.COMPOUND_K_MAX_BONUS)) === 1);
}

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURES`);
