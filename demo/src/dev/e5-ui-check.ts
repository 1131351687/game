import { isModuleUnlocked, isResourceRevealed } from '../game/reveal';
import type { E1State } from '../game/engine';
let f = 0;
function ok(l: string, c: boolean) { if (!c) f++; console.log(`[${c?'PASS':'FAIL'}] ${l}`); }
function st(era: string, techs: Record<string,boolean>): E1State {
  return { era, techs, buildings: {}, jobs: {}, recorded: [], tradeRoutes: [], reputation: 50,
           wood: 0, stone: 0, food: 0, experience: 0, population: 1, fire: 0, p1Unlocked: false,
           legacyPoints: 0, territory: 1, legions: 0, expansionPending: null, eraElapsedSec: 0,
           copper:0,tin:0,bronze:0,lapis:0,iron:0,coin:0, livestock:0, fabric:0,
           populationProgress:0, autoMaintainFire:false, recordedOnce: [] } as unknown as E1State;
}
console.log('=== E5 模块门控 ===');
ok('E5 无印刷术 → 远洋 Tab 不出现', !isModuleUnlocked('e5', st('E5', {})));
ok('E5 + 印刷术 → 远洋 Tab 出现', isModuleUnlocked('e5', st('E5', { printing: true })));
for (const e of ['E1','E2','E3','E4']) ok(`${e} 即便有印刷术也不出现远洋 Tab`, !isModuleUnlocked('e5', st(e, { printing: true })));
console.log('=== E5 资源揭示 ===');
ok('E5+印刷术 → 纸张可见', isResourceRevealed('paper', st('E5', { printing: true })));
ok('E5+印刷术 → 典籍可见', isResourceRevealed('books', st('E5', { printing: true })));
ok('E5+印刷术 → 研究点可见', isResourceRevealed('researchPoints', st('E5', { printing: true })));
ok('E5 无印刷术 → 纸张不可见', !isResourceRevealed('paper', st('E5', {})));
ok('E5+指南针 → 白银可见', isResourceRevealed('silver', st('E5', { printing: true, compass: true })));
ok('E5 无指南针 → 白银不可见', !isResourceRevealed('silver', st('E5', { printing: true })));
for (const e of ['E1','E2','E3','E4']) {
  ok(`${e} 纸张不可见`, !isResourceRevealed('paper', st(e, {})));
  ok(`${e} 白银不可见`, !isResourceRevealed('silver', st(e, { compass: true })));
}
console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURES`);
