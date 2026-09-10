// 时代维度 · 定义与工具函数
//
// 所有数据项（科技 / 资源 / 岗位 / 建筑）都通过 era 字段归属到某个时代。
// 本文件只维护"时代"这一层，不做引擎与 UI 逻辑。

/** 时代标识符 */
export type EraId = 'E1' | 'E2';

/** 单个时代的元数据 */
export interface EraMeta {
  /** 时代 id（与 EraId 一致） */
  id: EraId;
  /** 中文名称 */
  name: string;
  /** 序号（0 = 第一代）—— 用于计算时代距离 */
  index: number;
  /** 该时代的门槛科技 id（研究完才能跃迁到下一代） */
  gateTech: string;
  /** 跃迁到「下一代」的条件 */
  advanceConditions: {
    minFood: number;
    minHouses: number;
    minPopulation: number;
  };
  /** 该时代的研究队列长度 */
  queueLength: number;
}

/**
 * 所有时代配置（按 id 索引）
 *
 * 填值依据：
 * - E1 的条件必须与 src/data/constants.ts 的 ADVANCE_CONDITIONS 完全一致
 * - E2 的数值为占位值，待 E2 设计定稿后校准
 */
export const ERAS: Record<EraId, EraMeta> = {
  E1: {
    id: 'E1',
    name: '远古时代',
    index: 0,
    gateTech: 'plant_cultivation',
    advanceConditions: {
      minFood: 300,
      minHouses: 3,
      minPopulation: 15,
    },
    queueLength: 5,
  },
  E2: {
    id: 'E2',
    name: '定居时代',
    index: 1,
    gateTech: 'writing', // 文字，通往 E3
    advanceConditions: {
      // ⚠️ 以下数值为占位值，待 E2 设计定稿后校准
      minFood: 800,
      minHouses: 5,
      minPopulation: 30,
    },
    queueLength: 7,
  },
};

/**
 * 两个时代之间的序号距离
 * @example eraDistance('E1', 'E2') // 1
 */
export function eraDistance(from: EraId, to: EraId): number {
  return ERAS[to].index - ERAS[from].index;
}

/**
 * 时代距离对研究效率的衰减乘数
 *
 * 公式：max(0.2, 0.6 ** distance)
 * - distance=0 → 1.0（同时代，无衰减）
 * - distance=1 → 0.6（跨一个时代，衰减至 60%）
 * - distance=2 → 0.36
 * - distance≥4 → 0.2（最低保底）
 *
 * 用于离线研究/跨时代研究的效率计算，后续引擎层接入。
 */
export function eraDecay(distance: number): number {
  return Math.max(0.2, 0.6 ** distance);
}
