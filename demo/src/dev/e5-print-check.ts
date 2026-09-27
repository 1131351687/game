/**
 * E5 印刷链边界验算（一次性脚本，验收后可删）。
 *
 * 依据 design/game/eras/E5-devplan.md §三 T2：
 *   验证「缺料按比例降速」与四个瓶颈的判定。
 *
 * 用法（tsx 缺失时）：
 *   node .\node_modules\typescript\bin\tsc --outDir <tmp> --module commonjs \
 *        --target es2020 --moduleResolution node --skipLibCheck --esModuleInterop \
 *        src\dev\e5-print-check.ts
 *   node <tmp>\dev\e5-print-check.js
 */
import { calcPrintChain, getBookStorage, getPaperStorage } from '../game/e5/print';

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

const NEUTRAL = { paperOutputMul: 1, printOutputMul: 1, researchOutputMul: 1 };

function st(over: Partial<Record<string, unknown>> = {}): any {
  return {
    era: 'E5', wood: 1e6, paper: 1e6, books: 1e6,
    jobs: {}, buildings: {},
    ...over,
  };
}

console.log('=== 时代门控（关键回归保护）===');
for (const era of ['E1', 'E2', 'E3', 'E4', 'E6']) {
  const r = calcPrintChain(st({ era, jobs: { papermaker: 10, printer: 10, scholar: 10 }, buildings: { paper_mill: 5, printing_workshop: 5, university: 5 } }), NEUTRAL);
  eq(`${era} 纸张速率恒为 0`, r.paperRate, 0);
  eq(`${era} 典籍速率恒为 0`, r.bookRate, 0);
  eq(`${era} 研究点速率恒为 0`, r.researchRate, 0);
  eq(`${era} 木材不被消耗`, r.woodConsumed, 0);
}

console.log('\n=== 第 1 段：木材 → 纸张 ===');
// 1 座造纸坊 = 6 工位；放 6 个造纸工，料充足
let r = calcPrintChain(st({ jobs: { papermaker: 6 }, buildings: { paper_mill: 1 } }), NEUTRAL);
eq('6 造纸工名义产出 1.2×6', r.paperRate, 7.2);
eq('6 造纸工吃木 0.5×6', r.woodConsumed, 3.0);
eqStr('料充足时无瓶颈', r.bottleneck, 'none');

// 木材只剩一半需求 → 按比例降速到 50%
r = calcPrintChain(st({ wood: 1.5, jobs: { papermaker: 6 }, buildings: { paper_mill: 1 } }), NEUTRAL);
eq('木材减半 → 纸张减半', r.paperRate, 3.6);
eq('木材消耗也减半', r.woodConsumed, 1.5);
eqStr('判定为木材瓶颈', r.bottleneck, 'wood');

// 木材为 0 → 完全不产出（"乘数再大也乘不了 0"）
r = calcPrintChain(st({ wood: 0, jobs: { papermaker: 6 }, buildings: { paper_mill: 1 } }), NEUTRAL);
eq('零木材 → 零产出', r.paperRate, 0);
eqStr('仍判定为木材瓶颈', r.bottleneck, 'wood');

console.log('\n=== 第 2 段：纸张 → 典籍 ===');
r = calcPrintChain(st({ jobs: { printer: 8 }, buildings: { printing_workshop: 1 } }), NEUTRAL);
eq('8 印刷工名义产出 0.6×8', r.bookRate, 4.8);

// 纸张不足 → 按比例降速
// 8 印刷工需求 0.8×8 = 6.4 纸/秒；只给 3.2 → 50%
r = calcPrintChain(st({ paper: 3.2, jobs: { printer: 8 }, buildings: { printing_workshop: 1 } }), NEUTRAL);
eq('纸张减半 → 典籍减半', r.bookRate, 2.4);
eqStr('判定为纸张瓶颈', r.bottleneck, 'paper');

console.log('\n=== 第 3 段：典籍 → 研究点（消耗品）===');
r = calcPrintChain(st({ jobs: { scholar: 5 }, buildings: { university: 1 } }), NEUTRAL);
eq('5 学者名义产出 2.0×5', r.researchRate, 10);
eq('5 学者吃典 0.5×5', r.booksConsumed, 2.5);

r = calcPrintChain(st({ books: 1.25, jobs: { scholar: 5 }, buildings: { university: 1 } }), NEUTRAL);
eq('典籍减半 → 研究点减半', r.researchRate, 5);
eq('典籍消耗也减半', r.booksConsumed, 1.25);
eqStr('判定为典籍瓶颈', r.bottleneck, 'books');

console.log('\n=== 工位瓶颈 ===');
// 1 座造纸坊只给 6 工位，塞 10 个人
r = calcPrintChain(st({ jobs: { papermaker: 10 }, buildings: { paper_mill: 1 } }), NEUTRAL);
eq('10 人只有 6 工位 → 按 6 人算', r.paperRate, 7.2);
eqStr('判定为工位瓶颈', r.bottleneck, 'slots');

console.log('\n=== 串联：纸不够时，典籍也起不来 ===');
// 只有 3 个造纸工（3.6 纸/秒 = 0.6 产出），却有 8 个印刷工（需求 6.4/秒）
r = calcPrintChain(st({
  wood: 1e6, paper: 0, books: 1e6,
  jobs: { papermaker: 3, printer: 8, scholar: 0 },
  buildings: { paper_mill: 1, printing_workshop: 1 },
}), NEUTRAL);
// 纸：名义 3.6，木充足 → 3.6；印刷工需求 6.4，可用 0+3.6 → factor 0.5625
eq('串联后典籍速率受上游限制', r.bookRate, 4.8 * (3.6 / 6.4));
eqStr('瓶颈指向纸张', r.bottleneck, 'paper');

console.log('\n=== 存储口径 ===');
eq('无图书馆的典籍存储', getBookStorage({ buildings: {} }, 0), 20000);
eq('1 座图书馆 +20000', getBookStorage({ buildings: { library: 1 } }, 0), 40000);
eq('图书馆 + 科技加成', getBookStorage({ buildings: { library: 2 } }, 5000), 65000);
eq('纸张存储基底', getPaperStorage(0), 10000);

console.log('\n=== 科技乘数生效 ===');
r = calcPrintChain(st({ jobs: { papermaker: 6 }, buildings: { paper_mill: 1 } }),
  { ...NEUTRAL, paperOutputMul: 1.5 });
eq('纸张 ×1.5', r.paperRate, 7.2 * 1.5);
// 注意：乘数只影响产出，不影响**料耗** —— 效率提升不应让造纸工更费柴
eq('乘数不影响料耗', r.woodConsumed, 3.0);

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`);
