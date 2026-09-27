/**
 * E5 知识复利（核心机制）。
 *
 * 设计依据：design/game/eras/E5-maritime.md §11.2。
 *
 *   研究速度 = 印刷产能 B × 复利倍率 R(N) × 识字率因子
 *   R = 1 + k × N_eff
 *
 * 其中 N 是**本时代**已解锁的 E5 科技数。这一条三个闸门叠在一起：
 *   闸门一：N 跨代归零 —— 复利属于"这个时代的知识"，带不进 E6；
 *   闸门二：N_eff 分段递减 + 硬上限 32 —— 堆科技数不能无限放大；
 *   闸门三：科技成本 ≈ 1.12^n —— 第 n 项越来越贵，N 自己涨不动。
 *
 * ⚠️ 本文件**不缓存任何东西**。R 是 (N, k) 的纯函数，每次调用现算。
 *    一旦把 R 存进 state，就会变成"上一 tick 的 R"，
 *    "研究完一项科技→下一 tick 立刻变快" 的手感就没了。
 */

import type { EraState } from '../engine';
import { E5 } from '../../data/constants';
import { TECHS } from '../../data/techs';

/**
 * 统计指定时代已解锁的科技数 —— 复利公式里的 N。
 *
 * 只数**该时代**的科技：跨代归零是复利机制的第一道闸门。
 * 已解锁 = `state.techs[id] === true`。
 */
export function countEraTechs(state: EraState, era: string): number {
  let n = 0;
  for (const t of TECHS) {
    if (t.era === era && state.techs[t.id]) n++;
  }
  return n;
}

/**
 * N_eff：科技数的**有效**计数，分段递减。
 *
 *   1–20   → 原值        R 涨得最猛的一段
 *   21–35  → 每项算 0.5  收益腰斩，逼玩家开始挑
 *   36+    → 每项算 0.25 基本是心理安慰
 *   硬上限 32
 *
 * 纯函数，无副作用。
 */
export function getNeff(n: number): number {
  if (n <= E5.NEFF_SEG1_MAX) return n;

  if (n <= E5.NEFF_SEG2_MAX) {
    return E5.NEFF_SEG1_MAX + (n - E5.NEFF_SEG1_MAX) * E5.NEFF_SEG2_SLOPE;
  }

  const seg2 = E5.NEFF_SEG1_MAX + (E5.NEFF_SEG2_MAX - E5.NEFF_SEG1_MAX) * E5.NEFF_SEG2_SLOPE;
  const eff = seg2 + (n - E5.NEFF_SEG2_MAX) * E5.NEFF_SEG3_SLOPE;
  return Math.min(eff, E5.NEFF_CAP);
}

/**
 * 复利系数 k —— 由已研究科技的效果聚合而来。
 *
 * 期望值（全点满，未衰减）：
 *   印刷术 0.05 + 金属活字 0.01 + 大学制度 0.01 + 印坊分工 0.01 + 科学方法 0.02 = 0.10
 *
 * 注意 k 会随时代衰减（aggregateEffects 里走 addR），
 * 所以进了 E6 之后 k 会被拉向 0 —— 这是有意的：复利是 E5 的时代特权。
 */
export function getCompoundK(eff: { compoundKAdd: number }): number {
  const k = E5.COMPOUND_K_BASE + eff.compoundKAdd;
  // 基数 0.05 已含在 compoundKAdd 里（印刷术给 0.05），
  // 此处只做保底与上限裁剪，避免数据写错时 R 失控。
  const cap = E5.COMPOUND_K_BASE + E5.COMPOUND_K_MAX_BONUS;
  return Math.max(0, Math.min(k, cap));
}

/**
 * 复利倍率 R = 1 + k × N_eff，裁剪到绝对上限 ×4.20。
 *
 * @param state 引擎状态切片（读 era / techs）
 * @param eff   aggregateEffects 的产物（读 compoundKAdd）
 */
export function getCompoundMultiplier(
  state: EraState,
  eff: { compoundKAdd: number }
): number {
  // 复利只在 E5 生效：其他时代 k 视为 0，倍率恒为 1。
  // 这道门控是必须的 —— E1–E4 的基线（1163s/1920s）不能被新机制碰到，
  // 而 E6+ 靠 eraDecay 把 k 拉向 0 也不够，因为印刷术的 0.05 基数仍在。
  if (state.era !== 'E5') return 1;

  const n = countEraTechs(state, 'E5');
  const k = getCompoundK(eff);
  const raw = 1 + k * getNeff(n);
  return Math.min(raw, E5.COMPOUND_R_CAP);
}

/**
 * 复利面板需要的全部中间量，供 UI 一次取齐（避免 UI 自己重算公式）。
 * 只读，无副作用。
 */
export function getCompoundBreakdown(
  state: EraState,
  eff: { compoundKAdd: number }
): { n: number; nEff: number; k: number; r: number; capped: boolean } {
  const n = countEraTechs(state, 'E5');
  const nEff = getNeff(n);
  const k = getCompoundK(eff);
  const raw = 1 + k * nEff;
  return {
    n,
    nEff,
    k,
    r: state.era === 'E5' ? Math.min(raw, E5.COMPOUND_R_CAP) : 1,
    capped: raw >= E5.COMPOUND_R_CAP,
  };
}
