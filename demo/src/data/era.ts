// 时代维度 · 定义与工具函数
//
// 所有数据项（科技 / 资源 / 岗位 / 建筑）都通过 era 字段归属到某个时代。
// 本文件只维护"时代"这一层，不做引擎与 UI 逻辑。

/** 时代标识符 */
export type EraId = 'E1' | 'E2' | 'E3' | 'E4';

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
    /** 主粮（食物）最低储备；采集与农耕已合并为同一资源，不设则不检查 */
    minFood?: number;
    /** 住所 / 村落民居最低座数；不设则不检查 */
    minHouses?: number;
    /** 最低人口；不设则不检查 */
    minPopulation?: number;
    /**
     * 需要**完整度过**的年数（= 冬季数）。
     *
     * 这是 E2 独有的条件类型：E2 的核心机制是「周期」（夏秋生产、冬春消耗），
     * 用资源量衡量周期型玩法是不完整的 —— 玩家可能靠一次暴收就攒够粮，
     * 但他没有证明自己能**重复**这个周期。
     * 因此 E2 的毕业考试是「连续 8 年没饿死」，而不是「你有多少粮」。
     * 见 design/game/eras/E2-sedentary.md §11.8。
     */
    minYears?: number;
    /**
     * 其他建筑门槛：建筑 id → 最低座数。
     *
     * 通用字段，避免为每个时代新增一个专用数值。
     * E2 用它表达文档 §11.8 的「粮仓 ≥3 座、田地 ≥8 块」；
     * E3 用它表达「学宫 ≥3 座、商栈 ≥2 座」（E3-citystate.md §11.8）。
     */
    minBuildings?: Record<string, number>;
    /** 已刻录科技数门槛（E3 独有：刻录 ≥12 项） */
    minRecorded?: number;
    /** 版图最低格数（E4：版图 n ≥20） */
    minTerritory?: number;
    /** 铸币存量门槛（E4：铸币 ≥150,000，存量非累计） */
    minCoin?: number;
    /** 秩序门槛（E4：秩序 ≥80，太平档） */
    minOrder?: number;
    /** 资源存量门槛：资源 id → 最低值（E3：青铜 ≥2000） */
    minResources?: Record<string, number>;
  };
}

/**
 * 所有时代配置（按 id 索引）
 *
 * 填值依据：
 * - E1 的条件必须与 src/data/constants.ts 的 ADVANCE_CONDITIONS 完全一致
 * - E2 的条件按 design/game/eras/E2-sedentary.md §11.8 定稿
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
  },
  E2: {
    id: 'E2',
    name: '定居时代',
    index: 1,
    gateTech: 'writing', // 文字，通往 E3
    advanceConditions: {
      // ── 按 E2 文档 §11.8 定稿（2026-09-11，此前为占位值 800/5/30）──
      /** 食物 ≥ 1500 */
      minFood: 1500,
      /** 文档未要求村落民居 —— 住房由「人口 ≥75」间接约束（K 必须够大才养得起） */
      minPopulation: 75,
      /** 完整度过 ≥ 8 个冬季 —— 用连续越冬证明定居的存续能力（E2 独有条件；不设现实时长目标） */
      minYears: 8,
      /** 粮仓 ≥3 座、田地 ≥8 块（文档 §11.8） */
      minBuildings: { granary: 3, field: 8 },
    },
  },
  E3: {
    id: 'E3',
    name: '城邦时代',
    index: 2,
    gateTech: 'iron', // 钢铁，通往 E4（方案 B 门槛链：书写 → 钢铁 → 印刷术）
    advanceConditions: {
      // ── 按 E3-citystate.md §11.8 的六项条件 ──
      /** 人口 ≥ 1800 */
      minPopulation: 1800,
      /** 青铜库存 ≥ 2000 */
      minResources: { bronze: 2000 },
      /** 已刻录科技 ≥ 12 项（含门槛「钢铁」自身的刻录） */
      minRecorded: 12,
      /** 学宫 ≥3 座（记录容量 ≥18）、商栈 ≥2 座 */
      minBuildings: { academy: 3, trading_post: 2 },
    },
  },
  E4: {
    id: 'E4',
    name: '帝国时代',
    index: 3,
    gateTech: 'printing_press', // 印刷术，通往 E5（门槛链：书写→钢铁→印刷术→蒸汽机→电力→计算机）
    advanceConditions: {
      // ── 按 E4-empire.md §11.8 的五项条件 ──
      /** 版图 ≥ 20 格（扩张的最终形态） */
      minTerritory: 20,
      /** 铸币存量 ≥ 150,000（攒下一笔"转向知识"的启动资金） */
      minCoin: 150000,
      /** 官署 ≥ 6 座（保证治理覆盖率 κ 稳定在 0.8 以上） */
      minBuildings: { chancery: 6 },
      /** 秩序 ≥ 80（太平档） */
      minOrder: 80,
    },
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
