/**
 * E5 识字率。
 *
 * 设计依据：design/game/eras/E5-maritime.md §11.3。
 *
 * 识字率是 0–100 的**状态值，不是资源**：
 *   · 不参与资源栏显示；
 *   · 不占储存上限；
 *   · 增长是逻辑斯谛的 —— 越接近上限越慢，永远到不了上限。
 *
 * 它同时是三条路径的**隐性乘数**：
 *   研究速度 ×(0.70 + 0.60 × lit)
 *   人口增长 ×(同上)
 *   远航成功率 +0.10 × lit
 *
 * 也就是说：识字率不直接产出任何东西，却同时放大三件事。
 * 这是 E5 里最"慢"的一条线，也是最不该被忽略的一条。
 *
 * ⚠️ 本文件是纯函数集合，不读 state 之外的任何东西，不写任何东西。
 */

import { E5 } from '../../data/constants';

/** 识字率因子的中性值（lit = 0 时） */
export const LITERACY_FACTOR_MIN = 0.7;
/** 识字率因子的满值（lit = 1 时） */
export const LITERACY_FACTOR_MAX = 1.3;

/**
 * 识字率上限。
 *
 *   基础 0.15 + 每座大学 0.15，硬顶 0.95。
 *
 * 上限用 0–1 的小数表示（与 state.literacy 的 0–100 刻度不同），
 * 调用方需自行换算。硬顶 0.95 意味着**永远留 5% 的文盲**——
 * 这是刻意的：识字率不应该是"满了就没事了"的开关。
 */
export function getLiteracyUpperBound(
  universities: number,
  literacyCapAdd: number
): number {
  const raw =
    E5.LITERACY_CAP_BASE +
    universities * E5.LITERACY_CAP_PER_UNIVERSITY +
    literacyCapAdd;
  return Math.min(raw, E5.LITERACY_CAP_MAX);
}

/**
 * 印刷产能因子：决定识字率增长有多快。
 *
 *   0.5 + 0.5 × min(1, 典籍产能 / 2.0)
 *
 * 典籍产能 0 时因子 0.5（不是 0）：远洋时代不是文盲开局，
 * 起始 12% 的识字率靠的是既有社会存量，不是印刷机。
 * 典籍产能 ≥ 2.0/秒时因子饱和为 1.0。
 */
export function getPrintCapacityFactor(bookRate: number): number {
  return 0.5 + 0.5 * Math.min(1, Math.max(0, bookRate) / 2.0);
}

/**
 * 识字率因子：把识字率（0–100）映射成乘数（0.70–1.30）。
 *
 *   factor = 0.70 + 0.60 × lit
 *
 * lit 以 0–1 小数传入。这是研究速度 / 人口增长 / 远航成功率的共用乘数。
 */
export function getLiteracyFactor(lit01: number): number {
  const clamped = Math.max(0, Math.min(1, lit01));
  return E5.LITERACY_FACTOR_BASE + E5.LITERACY_FACTOR_SLOPE * clamped;
}

/**
 * 推进识字率 dt 秒。
 *
 *   基础增长 0.0008/秒 × 印刷产能因子 × 教师乘数 × (1 − lit/上限)
 *
 * 逻辑斯谛部分体现在最后的 (1 − lit/上限)：越接近上限，增长越慢，
 * 数学上永远不达上限。教师（×1.3）只在有教师时生效。
 *
 * @param literacy   当前识字率（0–100 刻度）
 * @param dt         秒
 * @param bookRate   典籍产能（/秒）—— 驱动印刷产能因子
 * @param teachers   教师人数
 * @param universities 大学数
 * @param literacyCapAdd 科技给的额外上限
 * @returns 新的识字率（0–100 刻度，已裁剪到上限）
 */
export function tickLiteracy(
  literacy: number,
  dt: number,
  bookRate: number,
  teachers: number,
  universities: number,
  literacyCapAdd: number
): number {
  const cap01 = getLiteracyUpperBound(universities, literacyCapAdd);
  const cap = cap01 * 100; // 换算到 0–100 刻度
  const cur = Math.max(0, Math.min(literacy, cap));

  // 已经到顶：不再增长（也不会倒退——识字率不会遗忘）
  if (cur >= cap) return cap;

  const printFactor = getPrintCapacityFactor(bookRate);
  const teacherMul = teachers > 0 ? E5.LITERACY_TEACHER_MUL : 1;
  const headroom = 1 - cur / cap; // 逻辑斯谛的剩余空间

  const gain = E5.LITERACY_GROWTH * printFactor * teacherMul * headroom * dt * 100;
  return Math.min(cur + gain, cap);
}

/**
 * 识字率面板需要的全部中间量，供 UI 一次取齐。
 */
export function getLiteracyBreakdown(
  literacy: number,
  bookRate: number,
  teachers: number,
  universities: number,
  literacyCapAdd: number
): {
  literacy: number;
  cap: number;
  factor: number;
  printFactor: number;
  teacherMul: number;
  headroom: number;
} {
  const cap01 = getLiteracyUpperBound(universities, literacyCapAdd);
  const cap = cap01 * 100;
  const cur = Math.max(0, Math.min(literacy, cap));
  return {
    literacy: cur,
    cap,
    factor: getLiteracyFactor(cur / 100),
    printFactor: getPrintCapacityFactor(bookRate),
    teacherMul: teachers > 0 ? E5.LITERACY_TEACHER_MUL : 1,
    headroom: Math.max(0, 1 - cur / cap),
  };
}
