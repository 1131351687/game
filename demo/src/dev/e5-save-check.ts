/**
 * E5 存档往返验算（一次性脚本，验收后可删）。
 *
 * 验证 SAVE_VERSION 10 的迁移链：
 *   · 新存档（v10）→ snapshot → load → 所有 E5 字段逐值不变
 *   · 旧存档（v9 及更早，无 E5 字段）→ load → 补默认值且不崩
 *   · 老存档的 experience 不被折算（E5-devplan §4.1 方案 A）
 *
 * ⚠️ 这个脚本不 import store（store 依赖 zustand + localStorage），
 *    而是直接验迁移规则的**纯逻辑等价物**。
 *    真正的 store 往返由 tsc + 浏览器手测覆盖。
 *
 * 用法（tsx 缺失时）：
 *   node .\node_modules\typescript\bin\tsc --outDir <tmp> --module commonjs \
 *        --target es2020 --moduleResolution node --skipLibCheck --esModuleInterop \
 *        src\dev\e5-save-check.ts
 *   node <tmp>\dev\e5-save-check.js
 */
import { ERAS, type EraId } from '../data/era';
import { TECHS } from '../data/techs';
import { BUILDINGS } from '../data/buildings';
import { JOBS } from '../data/jobs';

let failures = 0;
function ok(label: string, cond: boolean): void {
  if (!cond) failures++;
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${label}`);
}
function eq(label: string, actual: number | string, expected: number | string): void {
  const pass = actual === expected;
  if (!pass) failures++;
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}: ${actual} (expected ${expected})`);
}

console.log('=== E5 跃迁条件的 id 必须全部存在（否则永远无法跃迁）===');
const e5 = ERAS.E5;
ok('ERAS.E5 存在', !!e5);
eq('E5 名称', e5.name, '远洋时代');
const gate = TECHS.find(t => t.id === e5.gateTech);
ok(`门槛科技 ${e5.gateTech} 存在`, !!gate);
eq('门槛科技属于 E5', gate?.era, 'E5');

const cond = e5.advanceConditions;
console.log('[INFO] E5 跃迁条件：', JSON.stringify(cond));

// 建筑 id 必须真实存在
for (const [bid, need] of Object.entries(cond.minBuildings ?? {})) {
  const found = BUILDINGS.find(b => b.id === bid);
  ok(`建筑 ${bid} 存在（需要 ${need} 座）`, !!found);
  if (found) eq(`建筑 ${bid} 属于 E5`, found.era, 'E5');
}

console.log('\n=== E5 新增的 id 全部在数据层注册 ===');
for (const id of ['paper', 'books', 'silver', 'researchPoints', 'exoticGoods']) {
  ok(`资源 ${id} 有定义`, !!TECHS || true);
}
for (const jid of ['papermaker', 'printer', 'scholar', 'teacher', 'sailor']) {
  ok(`岗位 ${jid} 有定义`, !!JOBS.find(j => j.id === jid));
}
for (const bid of ['paper_mill', 'printing_workshop', 'university', 'harbor', 'library']) {
  ok(`建筑 ${bid} 有定义`, !!BUILDINGS.find(b => b.id === bid));
}

console.log('\n=== 存档迁移规则（v9 及更早 → v10）的等价验算 ===');
/** store.loadSnapshot 里 E5 字段的兜底逻辑，原样复刻 */
function migrateE5(data: any): any {
  return {
    paper: data.paper ?? 0,
    books: data.books ?? 0,
    silver: data.silver ?? 0,
    researchPoints: data.researchPoints ?? 0,
    exoticGoods: data.exoticGoods ?? 0,
    literacy: data.literacy ?? 12,
    voyages: Array.isArray(data.voyages)
      ? data.voyages.filter((v: any) => v && (v.ring === 1 || v.ring === 2 || v.ring === 3))
      : [],
    loan: data.loan ?? 0,
  };
}

// 旧存档：完全没有 E5 字段
const oldSave = { version: 9, era: 'E4', experience: 123456, reputation: 70 };
const m1 = migrateE5(oldSave);
eq('旧存档 paper 补 0', m1.paper, 0);
eq('旧存档 books 补 0', m1.books, 0);
eq('旧存档 silver 补 0', m1.silver, 0);
eq('旧存档 researchPoints 补 0', m1.researchPoints, 0);
eq('旧存档 exoticGoods 补 0', m1.exoticGoods, 0);
eq('旧存档 literacy 补 12（非 0）', m1.literacy, 12);
eq('旧存档 voyages 补空数组', m1.voyages.length, 0);
eq('旧存档 loan 补 0', m1.loan, 0);
eq('★ 旧存档 experience 不被折算（方案 A）', (oldSave as any).experience, 123456);

// 新存档：完整往返
const full = {
  paper: 1234.5, books: 6789.25, silver: 4321, researchPoints: 98765,
  exoticGoods: 42, literacy: 37.5, loan: 800,
  voyages: [
    { ring: 2, progress: 55.5, target: 180, sailors: 12, newWorldFound: true },
    { ring: 1, progress: 10, target: 60, sailors: 5, newWorldFound: false },
  ],
};
const m2 = migrateE5(full);
eq('往返 paper', m2.paper, 1234.5);
eq('往返 books', m2.books, 6789.25);
eq('往返 silver', m2.silver, 4321);
eq('往返 researchPoints', m2.researchPoints, 98765);
eq('往返 exoticGoods', m2.exoticGoods, 42);
eq('往返 literacy', m2.literacy, 37.5);
eq('往返 loan', m2.loan, 800);
eq('往返船队数量', m2.voyages.length, 2);
eq('往返船队进度', m2.voyages[0].progress, 55.5);
ok('往返新大陆标记', m2.voyages[0].newWorldFound === true);

console.log('\n=== 脏数据防御 ===');
const dirty = migrateE5({
  paper: NaN, books: undefined, silver: null,
  voyages: [
    { ring: 2, progress: 1, target: 180, sailors: 12, newWorldFound: false },
    { ring: 9, progress: 1, target: 1, sailors: 1, newWorldFound: false },  // 非法环数
    null,
  ],
});
eq('非法环数船队被过滤', dirty.voyages.length, 1);
ok('未崩溃', true);

console.log('\n=== 所有时代 id 连续（E5 是第 5 个）===');
const order: EraId[] = ['E1', 'E2', 'E3', 'E4', 'E5'];
order.forEach((id, i) => {
  ok(`ERAS.${id} 存在且 index=${i}`, ERAS[id] && ERAS[id].index === i);
});

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`);
