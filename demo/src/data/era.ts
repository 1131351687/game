// 时代维度 · 定义与工具函数
//
// 所有数据项（科技 / 资源 / 岗位 / 建筑）都通过 era 字段归属到某个时代。
// 本文件只维护"时代"这一层，不做引擎与 UI 逻辑。

/** 时代标识符 */
export type EraId = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6';

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
    /** 资源存量门槛：资源 id → 最低值（E3：青铜 ≥2000） */
    minResources?: Record<string, number>;
    /** E4 版图最低格数 */
    minTerritory?: number;
    /** E4 铸币最低存量 */
    minCoin?: number;
    /**
     * 完成过的远航最低环数（E5 独有）。
     *
     * 对应 E5-maritime.md §11.8 的「完成 ≥1 次第 2 环远航」。
     * 用「已达成过的最高环」而不是「当前是否有船在海上」来衡量 ——
     * 后者取决于玩家此刻的操作时序，做毕业考试会变成手速测试。
     */
    minVoyageRing?: 1 | 2 | 3;
    /**
     * 电网供电率最低值（E6 独有）。
     *
     * 对应 E6-machine.md §11.10 的「ρ ≥ 0.90」。
     * 这一项考的不是"你有没有发电厂"，而是**发电够不够带满全部工厂** ——
     * 建了 15 座工厂却只配 3 座电厂时 ρ 会掉到 0.3 一带，
     * 工厂虽然"建成了"，产出却被电网掐住。这是 E6 的核心权衡：
     * 产能扩张必须与电力建设同步，否则造得越多跑得越慢。
     */
    minRho?: number;
    /**
     * 城市化率最低值（E6 独有，0–1）。
     *
     * 对应 E6-machine.md §11.10 的「城市化率 ≥ 70%」。
     * 城市化不是免费的：它同时是**拥挤系数**与**污染**两个负向 r 因子的载体
     * （§11.7），所以这一项实际在考"你能不能把城市的代价治住"，
     * 而不是"你能堆多少工人住宅"。
     */
    minUrbanization?: number;
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
    gateTech: 'unification',
    advanceConditions: {
      minTerritory: 20,
      minCoin: 150000,
      minBuildings: { legion_camp: 4 },
    },
  },
  E5: {
    id: 'E5',
    name: '远洋时代',
    index: 4,
    // 门户科技：蒸汽机，通往 E6（工业时代）
    // 门槛链：书写 → 钢铁 → 印刷术 → 蒸汽机
    gateTech: 'steam_engine',
    advanceConditions: {
      // ── 按 E5-maritime.md §11.8 的八项条件 ──
      /** 人口 ≥ 800 */
      minPopulation: 800,
      /** 白银 ≥ 5,000、典籍 ≥ 20,000（典籍是消耗品，此处考的是"存得住"） */
      minResources: { silver: 5000, books: 20000 },
      /** 印书坊 ≥3 座、大学 ≥2 座、航海港 ≥1 座 */
      minBuildings: { printing_workshop: 3, university: 2, harbor: 1 },
      /** 完成 ≥1 次第 2 环远航（发现新大陆） */
      minVoyageRing: 2,
    },
  },
  E6: {
    id: 'E6',
    name: '机器时代',
    index: 5,
    // 门户科技：电力（发电机与输配电网），通往 E7 电气时代
    // 门槛链：书写 → 钢铁 → 印刷术 → 蒸汽机 → 电力
    gateTech: 'electric_power',
    advanceConditions: {
      // ── 按 E6-machine.md §11.10 的六项条件 ──
      /** 人口 ≥ 3,600 */
      minPopulation: 3600,
      /** 钢 ≥ 200,000（工业化的物质积累） */
      minResources: { steel: 200000 },
      /** 工厂 ≥ 15 座 */
      minBuildings: { factory: 15 },
      /** 电网供电率 ρ ≥ 0.90 —— 发电必须跟得上工厂 */
      minRho: 0.9,
      /** 城市化率 ≥ 70% —— 且必须把拥挤与污染的代价治住 */
      minUrbanization: 0.7,
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
