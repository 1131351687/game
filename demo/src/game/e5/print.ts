/**
 * E5 印刷链（木材 → 纸张 → 典籍 → 研究点）。
 *
 * 设计依据：design/game/era/E5-maritime.md §7 岗位集、§11.3 产能规格。
 *
 * 四段链条：
 *   造纸工 0.5 木/秒 → 纸张 1.2/秒
 *   印刷工 0.8 纸/秒 → 典籍 0.6/秒
 *   学者   0.5 典/秒 → 研究点 2.0/秒
 *
 * 与 E1–E4 岗位的根本区别：**这一段有物料输入**。
 * 既有引擎的岗位模型是「人 → 产出」，没有「人 + 料 → 产出」。
 * 本文件把输入约束显式建模，规则统一为：
 *
 *   实际速率 = 名义速率 × min(1, 可用输入 / 名义输入需求)
 *
 * 也就是「乘数再大也乘不了 0」——缺料时按比例降速，而不是报错或照常产出。
 * 这条规则让四个瓶颈（原料/产能/转化/存储）各自都能独立卡住玩家。
 *
 * ⚠️ 典籍是**消耗品**：学者把它读掉。库存下降是设计，不是 bug。
 *    玩家看到典籍在掉，说明印刷链在转。
 */

import { E5 } from '../../data/constants';

/** 造纸工：每人每秒吃 0.5 木材 */
export const PAPER_INPUT_PER_WORKER = 0.5;
/** 印刷工：每人每秒吃 0.8 纸张 */
export const PRINTER_INPUT_PER_WORKER = 0.8;
/** 学者：每人每秒吃 0.5 典籍 */
export const SCHOLAR_INPUT_PER_WORKER = 0.5;

/** 造纸坊提供的造纸工工位 */
export const PAPER_MILL_SLOTS = 6;
/** 印书坊提供的印刷工工位 */
export const PRINTING_WORKSHOP_SLOTS = 8;
/** 大学提供的学者/教师工位 */
export const UNIVERSITY_SLOTS = 5;

/** 只读的印刷链输入切片 */
interface PrintInputs {
  era: string;
  wood: number;
  paper: number;
  books: number;
  jobs: Record<string, number>;
  buildings: Record<string, number>;
}

/** 只读的印刷链效果切片（aggregateEffects 的产物） */
interface PrintEffects {
  paperOutputMul: number;
  printOutputMul: number;
  researchOutputMul: number;
}

/**
 * 印刷链在某一瞬间的实际速率与瓶颈。
 *
 * 返回的 rate 单位是「资源/秒」，已经含输入约束。
 * 五个字段一次取齐，供 tick 与 UI 共用（避免两边各算一遍导致显示不一致）。
 */
export interface PrintChainRates {
  /** 纸张净产出速率（可为负：缺木时不产出，但不会倒扣） */
  paperRate: number;
  /** 典籍净产出速率 */
  bookRate: number;
  /** 研究点产出速率 */
  researchRate: number;
  /** 木材每秒被造纸工吃掉多少 */
  woodConsumed: number;
  /** 典籍每秒被学者吃掉多少（消耗品的证据） */
  booksConsumed: number;
  /** 当前卡在哪一环；'none' 表示通畅 */
  bottleneck: 'wood' | 'paper' | 'books' | 'slots' | 'none';
}

/** 实际可上岗人数 = min(已分配, 工位容量) */
function staffed(assigned: number, slots: number): number {
  return Math.max(0, Math.min(assigned, slots));
}

/**
 * 计算印刷链各段的实际速率。
 *
 * 纯函数，不修改任何状态，不产生副作用。
 */
export function calcPrintChain(
  state: PrintInputs,
  eff: PrintEffects
): PrintChainRates {
  const neutral: PrintChainRates = {
    paperRate: 0,
    bookRate: 0,
    researchRate: 0,
    woodConsumed: 0,
    booksConsumed: 0,
    bottleneck: 'none',
  };

  // 时代门控：印刷链只属于 E5。其它时代完全中性，
  // 保证 E1–E4 的产出路径一根头发都不动。
  if (state.era !== 'E5') return neutral;

  const mills = state.buildings.paper_mill ?? 0;
  const shops = state.buildings.printing_workshop ?? 0;
  const unis = state.buildings.university ?? 0;

  const makers = staffed(state.jobs.papermaker ?? 0, mills * PAPER_MILL_SLOTS);
  const printers = staffed(state.jobs.printer ?? 0, shops * PRINTING_WORKSHOP_SLOTS);
  const scholars = staffed(state.jobs.scholar ?? 0, unis * UNIVERSITY_SLOTS);

  // 有活干但没工位 —— 这是「产能」瓶颈，值得单独报出来
  const slotsBlocked =
    (state.jobs.papermaker ?? 0) > makers ||
    (state.jobs.printer ?? 0) > printers ||
    (state.jobs.scholar ?? 0) > scholars;

  // ── 第 1 段：木材 → 纸张 ──
  let paperRate = 0;
  let woodConsumed = 0;
  if (makers > 0) {
    const nominal = makers * 1.2 * eff.paperOutputMul;
    const demand = makers * PAPER_INPUT_PER_WORKER;
    const avail = Math.max(0, state.wood);
    const factor = demand > 0 ? Math.min(1, avail / demand) : 1;
    paperRate = nominal * factor;
    woodConsumed = demand * factor;
  }

  // ── 第 2 段：纸张 → 典籍 ──
  //
  // 输入 = 现有库存 + 本 tick 新造的纸。两者都算，否则首批纸永远进不了下一环。
  let bookRate = 0;
  if (printers > 0) {
    const nominal = printers * 0.6 * eff.printOutputMul;
    const demand = printers * PRINTER_INPUT_PER_WORKER;
    const avail = Math.max(0, state.paper) + paperRate;
    const factor = demand > 0 ? Math.min(1, avail / demand) : 1;
    bookRate = nominal * factor;
  }

  // ── 第 3 段：典籍 → 研究点（学者把典籍读掉）──
  let researchRate = 0;
  let booksConsumed = 0;
  if (scholars > 0) {
    const nominal = scholars * 2.0 * eff.researchOutputMul;
    const demand = scholars * SCHOLAR_INPUT_PER_WORKER;
    const avail = Math.max(0, state.books);
    const factor = demand > 0 ? Math.min(1, avail / demand) : 1;
    researchRate = nominal * factor;
    booksConsumed = demand * factor;
  }

  // ── 瓶颈判定（从上游往下游找第一个"没吃饱"的环节）──
  let bottleneck: PrintChainRates['bottleneck'] = 'none';
  if (makers > 0 && woodConsumed < makers * PAPER_INPUT_PER_WORKER - 1e-9) {
    bottleneck = 'wood';
  } else if (printers > 0 && bookRate < printers * 0.6 * eff.printOutputMul - 1e-9) {
    bottleneck = 'paper';
  } else if (scholars > 0 && researchRate < scholars * 2.0 * eff.researchOutputMul - 1e-9) {
    bottleneck = 'books';
  } else if (slotsBlocked) {
    bottleneck = 'slots';
  }

  return { paperRate, bookRate, researchRate, woodConsumed, booksConsumed, bottleneck };
}

/**
 * 瓶颈的中文文案，供 UI 直接显示。
 * 空链条也有话说——新玩家最需要的恰恰是"我该先造什么"。
 */
export function describeBottleneck(b: PrintChainRates['bottleneck']): string {
  switch (b) {
    case 'wood':
      return '木材见底：造纸工在等米下锅。加伐木工或减造纸工。';
    case 'paper':
      return '纸张不够：印刷工空转。加造纸工或造造纸坊。';
    case 'books':
      return '典籍不足：学者无书可读。加印刷工或造印书坊。';
    case 'slots':
      return '工位不足：有人没地方干活。造对应建筑扩工位。';
    case 'none':
    default:
      return '印刷链通畅。';
  }
}

/**
 * 典籍存储上限（第四个瓶颈：存储）。
 *
 * 基础值来自 E5 常量，图书馆与科技各加一些。
 * 与 getResourceStorage 的口径保持一致 —— 那边会调用本函数。
 */
export function getBookStorage(
  state: { buildings: Record<string, number> },
  bookCapacityAdd: number
): number {
  const libraries = state.buildings.library ?? 0;
  // 基础 20000：一个印书坊满负荷转，十秒就是 6000 典，
  // 不给足存储会立刻卡在"造出来就溢出"上。
  return 20000 + libraries * E5.LIBRARY_BOOK_STORAGE + bookCapacityAdd;
}

/** 纸张存储上限：纸张是中间品，给一个宽松但有限的口径 */
export function getPaperStorage(libraryBonus: number): number {
  return 10000 + libraryBonus;
}
