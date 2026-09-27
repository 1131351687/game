/**
 * E5 远航探索（三环）。
 *
 * 设计依据：design/game/eras/E5-maritime.md §11.6、§13。
 *
 * 三环：近海 60s / 远洋 180s / 环球 480s。
 * 进度 = 水手数 × 1.0/秒，到 target 即结算一次事件。
 *
 * ⚠️ 单次远航在数值上**刻意不划算**：第 2 环期望白银收益 +20.5，
 *    而成本是 50 银。也就是说纯功利地算出海是亏的。
 *    玩家出海的理由不是"赚钱"，而是：
 *      · 印书坊与大学的成本里有白银 —— 不出海就造不出来；
 *      · 首次完成第 2 环**必定**触发「发现新大陆」，给一大笔一次性奖励。
 *    这是把"探索"从收益计算里解放出来的设计选择。
 *
 * ⚠️ 事件结算必须是**确定性可复现**的：同一个 rng 序列必须给出同一个结果，
 *    否则 autoplay 基线无法复现。因此本文件所有随机性都走传入的 rng()，
 *    绝不内部调用 Math.random()。
 */

import { E5 } from '../../data/constants';
import type { Voyage } from '../engine';

/** 一次事件结算的结果 */
export interface VoyageOutcome {
  /** 事件名（中文，直接可显示） */
  label: string;
  /** 该事件是否算"成功"（影响消息配色） */
  success: boolean;
  /** 进度返还倍率（顺风 >1，风暴 <1） */
  progressMul: number;
  /** 奖励 */
  reward: {
    silver?: number;
    exoticGoods?: number;
    researchPoints?: number;
    foodMul?: number;
    kCapMul?: number;
    chartBonus?: number;
    researchSpeedMul?: number;
  };
  /** 沉船时返还的建造物料比例（对白银而言） */
  refundRatio?: number;
  /** 是否是"发现新大陆"（全局一次性里程碑） */
  newWorld?: boolean;
}

/** 第 2 环的事件权重表（百分比，合计 100） */
export const RING2_EVENTS: ReadonlyArray<{ w: number; make: () => VoyageOutcome }> = [
  { w: 18, make: () => ({ label: '发现新大陆', success: true, progressMul: 1, reward: {}, newWorld: true }) },
  { w: 15, make: () => ({ label: '香料海岸', success: true, progressMul: 1, reward: { silver: 150, exoticGoods: 5 } }) },
  { w: 14, make: () => ({ label: '顺风', success: true, progressMul: 1.25, reward: {} }) },
  { w: 12, make: () => ({ label: '风暴', success: false, progressMul: 0.7, reward: {} }) },
  { w: 10, make: () => ({ label: '原住民接触', success: true, progressMul: 1, reward: { exoticGoods: 8 } }) },
  { w: 8, make: () => ({ label: '船员病疫', success: false, progressMul: 1, reward: {} }) },
  { w: 8, make: () => ({ label: '沉船', success: false, progressMul: 1, reward: {}, refundRatio: 0.5 }) },
  { w: 6, make: () => ({ label: '古代典籍', success: true, progressMul: 1, reward: { researchPoints: 500 } }) },
  { w: 5, make: () => ({ label: '海图残页', success: true, progressMul: 1, reward: { chartBonus: 0.02 } }) },
  { w: 3, make: () => ({ label: '黄金国传说', success: true, progressMul: 1, reward: { exoticGoods: 15 } }) },
  { w: 1, make: () => ({ label: '环球航线', success: true, progressMul: 1, reward: { researchSpeedMul: 1.05 } }) },
];

/** 第 1 环（近海）：没有新大陆，风险与收益都小 */
export const RING1_EVENTS: ReadonlyArray<{ w: number; make: () => VoyageOutcome }> = [
  { w: 40, make: () => ({ label: '渔汛', success: true, progressMul: 1.1, reward: { foodMul: 1.02 } }) },
  { w: 25, make: () => ({ label: '沿岸贸易', success: true, progressMul: 1, reward: { silver: 20 } }) },
  { w: 20, make: () => ({ label: '风平浪静', success: true, progressMul: 1, reward: {} }) },
  { w: 10, make: () => ({ label: '触礁', success: false, progressMul: 0.85, reward: {} }) },
  { w: 5, make: () => ({ label: '海盗', success: false, progressMul: 1, reward: {}, refundRatio: 0.4 }) },
];

/** 第 3 环（环球）：高风险高回报 */
export const RING3_EVENTS: ReadonlyArray<{ w: number; make: () => VoyageOutcome }> = [
  { w: 30, make: () => ({ label: '环球航行成功', success: true, progressMul: 1, reward: { silver: 600, exoticGoods: 20, researchPoints: 3000 } }) },
  { w: 22, make: () => ({ label: '未知大陆', success: true, progressMul: 1, reward: { exoticGoods: 25, silver: 200 } }) },
  { w: 18, make: () => ({ label: '补给港', success: true, progressMul: 1.2, reward: { silver: 100 } }) },
  { w: 15, make: () => ({ label: '大洋风暴', success: false, progressMul: 0.5, reward: {} }) },
  { w: 10, make: () => ({ label: '船员哗变', success: false, progressMul: 0.8, reward: {} }) },
  { w: 5, make: () => ({ label: '舰队失踪', success: false, progressMul: 1, reward: {}, refundRatio: 0.25 }) },
];

/** 取对应环的事件表 */
export function getEventTable(ring: 1 | 2 | 3) {
  if (ring === 1) return RING1_EVENTS;
  if (ring === 3) return RING3_EVENTS;
  return RING2_EVENTS;
}

/**
 * 按权重表抽一个事件。
 *
 * 用 rng() 单次调用决定落在哪个区间 —— 一次抽取，一次消耗，
 * 保证同一个 rng 序列结果完全可复现。
 */
export function rollVoyageEvent(ring: 1 | 2 | 3, rng: () => number): VoyageOutcome {
  const table = getEventTable(ring);
  const total = table.reduce((s, e) => s + e.w, 0);
  let roll = rng() * total;
  for (const e of table) {
    roll -= e.w;
    if (roll < 0) return e.make();
  }
  // 浮点收尾：落到最后一个
  return table[table.length - 1].make();
}

/** 一艘船的当前状态（只读切片） */
export interface VoyageProgress {
  ring: 1 | 2 | 3;
  progress: number;
  target: number;
  newWorldFound: boolean;
}

/**
 * 推进一支船队 dt 秒。
 *
 * 进度 = 水手 × 1.0/秒 × (1 + 科技加成 + 识字率加成)。
 * 识字率加成 = 0.10 × lit（lit 为 0–1 小数）。
 *
 * 返回新进度与"是否达成"。达成**不在本函数内结算事件** ——
 * 事件结算需要 rng 与全局状态（新大陆是否已发现），由调用方（tick）负责。
 * 这样本函数保持纯粹，可单独测。
 */
export function advanceVoyage(
  v: VoyageProgress,
  dt: number,
  sailors: number,
  voyageBonus: number,
  literacy01: number
): { progress: number; target: number; completed: boolean } {
  const speed = sailors * E5.VOYAGE_PROGRESS_PER_SAILOR * (1 + voyageBonus + E5.VOYAGE_LITERACY_BONUS * literacy01);
  const progress = v.progress + speed * dt;
  return { progress, target: v.target, completed: progress >= v.target };
}

/**
 * 建一支新船队。
 *
 * target = 该环时长（不随水手数变化）—— 时长是航程的固有属性，
 * 水手多只是走得快。这样"多派水手"永远是线性收益，不会出现
 * 人数不够就永远走不完的死局。
 */
export function createVoyage(ring: 1 | 2 | 3): Voyage {
  return {
    ring,
    progress: 0,
    target: E5.VOYAGE_DURATION[ring],
    sailors: E5.VOYAGE_SAILORS[ring],
    newWorldFound: false,
  };
}

/** 该环的物料成本 */
export function getVoyageCost(ring: 1 | 2 | 3): Record<string, number> {
  return E5.VOYAGE_COST[ring];
}

/** 船队容量 = 航海港数量（每港 1 支） */
export function getVoyageCapacity(harbors: number): number {
  return Math.max(0, harbors);
}

/** 环数中文名，供 UI 使用 */
export function ringName(ring: 1 | 2 | 3): string {
  return ring === 1 ? '近海' : ring === 2 ? '远洋' : '环球';
}
