// E1 远古时代 · 全局常量
// 数值来源：design/game/02-tech-eras.md 第 11 节

// ─────────────────────────────────────────────
// 火种系统
// ─────────────────────────────────────────────
export const FIRE = {
  /** 火种上限 */
  MAX: 100,
  /**
   * 自然衰减（每秒）
   * 首轮实测 2.0 太快（100 火种仅撑 50 秒），玩家反馈压力过大，调为 1.0
   * —— 满火种可撑 100 秒，维持成本降为 0.167 木材/秒
   */
  DECAY_PER_SEC: 1.0,
  /** 每单位木材补充的火种 */
  PER_WOOD: 6,
  /** 木材投入档位（UI 按钮用） */
  WOOD_INPUT_STEPS: [10, 50, 100] as const,
  /** 自动维持：低于此值时自动投料 */
  AUTO_MAINTAIN_THRESHOLD: 40,
} as const;

export type FireTier = 'out' | 'weak' | 'stable' | 'blazing';

/** 火种档位（按火种值判定） */
export function getFireTier(fire: number): FireTier {
  if (fire <= 0) return 'out';
  if (fire <= 33) return 'weak';
  if (fire <= 66) return 'stable';
  return 'blazing';
}

export const FIRE_TIER_INFO: Record<
  FireTier,
  { name: string; factor: number; color: string; foodBonus: number }
> = {
  out: { name: '熄灭', factor: 0, color: 'text-gray-500', foodBonus: 0 },
  weak: { name: '微弱', factor: 0.5, color: 'text-orange-400', foodBonus: 0.1 },
  stable: { name: '稳定', factor: 1.0, color: 'text-orange-300', foodBonus: 0.25 },
  blazing: { name: '旺盛', factor: 1.25, color: 'text-yellow-300', foodBonus: 0.4 },
};

// ─────────────────────────────────────────────
// 人口模型（逻辑斯蒂增长）
// ─────────────────────────────────────────────
export const POPULATION = {
  /** 基础增长率（每秒）—— 首轮实测 0.02 增长过慢（人口爬坡乏力），调到 0.03 */
  BASE_GROWTH_RATE: 0.03,
  /** 无住所时的人口上限基准 */
  BASE_CAPACITY: 4,
  /** 每座住所提供的容量 */
  CAPACITY_PER_HOUSE: 4,
  /** 每人每秒消耗的食物 */
  FOOD_CONSUMPTION_PER_PERSON: 0.2,
  /**
   * 每人每秒产出的经验
   * 首轮实测 0.12 增长过快（20 人时 3.0/秒，科技消耗跟不上），调为 0.08
   *
   * ⚠️ 命名备忘：这是**早期时代**的叫法。按设计文档，E3 城邦时代
   * 解锁「文字」后，该资源应改名为「知识」（研究成果可被刻录留存）。
   * 届时需要：① 资源定义改 name ② UI 文案同步 ③ 存档做迁移。
   */
  EXP_PER_PERSON: 0.08,
  /** 火种熄灭时的人口下降速率（每秒） */
  STARVATION_DECAY: 0.5,
  /**
   * 冬季缺粮减员速率（每秒/人）。
   *
   * 与 logistic 增长项**独立**：只在「季节循环开启 + 当前冬季 + 人均储粮 < 阈值」时触发，
   * 方向只由食物决定（修复原 seasonR 负值与 foodFactor 的符号交互 bug）。
   * 0.05/秒 是温和减员；储粮 ≥ 阈值的冬天不扣人，只是增长率×0.4 慢慢涨。
   */
  WINTER_ATTRITION_PER_SEC: 0.05,
  /**
   * 冬季减员的人均储粮阈值。
   * 对应 getFoodFactorFromStorage 的分级：人均 < 32（foodFactor ≤ 0.4 那档）视为"存粮偏薄"，
   * 触发冬季减员；≥ 32 视为过冬充裕，不扣人。
   */
  WINTER_STORED_FOOD_THRESHOLD: 32,
  /** 起始人口 */
  START: 2,
} as const;

// ─────────────────────────────────────────────
// 食物因子（影响人口增长）
// ─────────────────────────────────────────────
export const FOOD_FACTOR = {
  /** 充裕：食物 > 消耗 × 2 */
  ABUNDANT: 1.0,
  /** 正常 */
  NORMAL: 0.8,
  /** 紧张：食物 < 消耗 */
  TIGHT: 0,
  /** 饥荒：储备耗尽 */
  FAMINE: -0.2,
} as const;

// ─────────────────────────────────────────────
// 食物因子阈值（人均「存粮秒数」口径）
// ─────────────────────────────────────────────
//
// 旧 E2 设计按"人均储粮(粮/人)"分级：<12→0、<32→0.4、<60→0.8、≥60→1.0。
// 这是固定消耗 0.25/秒/人 下的等价写法（12 粮 = 48 秒存粮）。
//
// E3 人口 300+、消耗 0.2/秒/人，但食物上限撑不到人均 12 粮，
// 导致人均储粮恒 < 12 → 食物因子恒 0 → 任何季节 logistic 项为 0 → 人口不涨。
//
// 改为与消耗率无关的"人均存粮秒数"口径：
//   storedSec = food / (population × perSec)
//   perSec = era==='E3' ? E3.POP_FOOD_PER_PERSON(0.2) : E2.FOOD_PER_PERSON_SEC(0.25)
//
// 换算来历（等价关系，E2 行为逐字节不变）：
//   48s  = 12粮 / 0.25(E2)  → 与 E2 原 <12 粮→0 完全等价
//   128s = 32粮 / 0.25      → 与 E2 原 <32 粮→0.4 完全等价
//   240s = 60粮 / 0.25      → 与 E2 原 <60 粮→0.8 完全等价
// E3 自动适配：0.2/秒 下，人均 9.6 / 25.6 / 48 粮即达到同一档（同一"能撑多少秒"语义）。
export const FOOD_FACTOR_STORED_SEC = {
  /** 紧张阈值：storedSec < 该值 → 食物因子 0 */
  TIGHT: 48,
  /** 正常偏薄阈值：storedSec < 该值 → 食物因子 0.4 */
  NORMAL_LOW: 128,
  /** 充裕阈值：storedSec < 该值 → 食物因子 0.8；≥ 该值 → 1.0 */
  ABUNDANT: 240,
} as const;

// ─────────────────────────────────────────────
// 工具世代（文明级，非个体装备）
// ─────────────────────────────────────────────
export interface ToolTier {
  level: number;
  name: string;
  /** 狩猎效率倍率 */
  multiplier: number;
  /** 史实锚点 */
  anchor: string;
}

export const TOOL_TIERS: ToolTier[] = [
  { level: 0, name: '无工具', multiplier: 0, anchor: '—' },
  { level: 1, name: '削尖木矛', multiplier: 1.0, anchor: 'Schöningen 矛，约 40 万年前' },
  { level: 2, name: '装柄石矛', multiplier: 1.4, anchor: '树脂黏合剂，6–3.5 万年前' },
  { level: 3, name: '投矛器', multiplier: 1.96, anchor: '约 2.1–1.7 万年前' },
  { level: 4, name: '弓箭', multiplier: 3.14, anchor: '⚠️ 起源争议（8 万–1.7 万年）' },
  // ── E3 城邦时代：青铜工具世代（见 E3-citystate.md §11.4）──
  { level: 5, name: '红铜', multiplier: 1.25, anchor: '天然红铜锤锻，约 6000 BCE' },
  { level: 6, name: '砷青铜', multiplier: 1.3, anchor: '砷青铜较硬但有毒，约 3500 BCE' },
  { level: 7, name: '锡青铜', multiplier: 1.6, anchor: '锡青铜：合适的锡含量（约 10%）' },
  { level: 8, name: '青铜兵器', multiplier: 1.6, anchor: '武器级装备；其价值在损失事件减免' },
];

export function getToolMultiplier(level: number, workshopBonus = 0): number {
  const tier = TOOL_TIERS[Math.min(level, TOOL_TIERS.length - 1)];
  return tier.multiplier * (1 + workshopBonus);
}

// ─────────────────────────────────────────────
// 建筑效果常量
// ─────────────────────────────────────────────
export const BUILDING_EFFECTS = {
  /** 火塘：火种衰减减免 */
  HEARTH_DECAY_REDUCTION: 0.2,
  /** 火塘：火种上限加成 */
  HEARTH_MAX_BONUS: 20,
  /** 作坊：工具世代效果加成 */
  WORKSHOP_BONUS: 0.2,
} as const;

// ─────────────────────────────────────────────
// 研究队列
// ─────────────────────────────────────────────
/**
 * 离线收益参数（研究队列已移除，离线只保留收益结算）。
 *
 * 名字沿用了旧的 QUEUE 块（离线收益一度挂在队列系统上），
 * 队列删除后改名为 OFFLINE 以免误导。
 */
export const OFFLINE = {
  /** 离线研究效率 */
  OFFLINE_EFFICIENCY: 0.5,
  /** 离线收益上限（秒）= 8 小时 */
  OFFLINE_CAP_SEC: 8 * 3600,
} as const;

// ─────────────────────────────────────────────
// 时代跃迁条件（E1 → E2）
// ─────────────────────────────────────────────
/**
 * 时代跃迁条件（E1 → E2）
 *
 * ⚠️ 此常量已被 ERAS.E1.advanceConditions 取代，未来会移除。
 * 请通过 ERAS[era].advanceConditions 获取对应时代的跃迁条件。
 */
export const ADVANCE_CONDITIONS = {
  /** 需研究的门槛科技 */
  GATE_TECH: 'plant_cultivation',
  /** 食物储备要求 */
  MIN_FOOD: 300,
  /** 住所数量要求 */
  MIN_HOUSES: 3,
  /** 人口要求 */
  MIN_POPULATION: 15,
} as const;

// ─────────────────────────────────────────────
// 起始状态
// ─────────────────────────────────────────────
export const INITIAL_STATE = {
  population: POPULATION.START,
  food: 20,
  wood: 10,
  stone: 0,
  experience: 0,
  fire: 0, // 尚未掌握火
} as const;

// ─────────────────────────────────────────────
// 循环频率（与 scheduler 对齐）
// ─────────────────────────────────────────────
export const LOOP = {
  /** fastLoop 间隔 */
  FAST_MS: 250,
  /** fastLoop 的秒数（用于 dt） */
  DT: 0.25,
  /** midLoop 间隔（fastLoop 次数） */
  MID_RATIO: 4,
  /** longLoop 间隔（fastLoop 次数） */
  LONG_RATIO: 20,
  /** 自动存档间隔（秒） */
  AUTOSAVE_SEC: 5,
} as const;

// ─────────────────────────────────────────────
// E2 定居时代常量
// ─────────────────────────────────────────────
export const E2 = {
  /** 每座村落民居提供的人口上限 */
  CAPACITY_PER_VILLAGE_HOUSE: 4,
  /** 每座田地提供的农夫工作位 */
  JOBS_PER_FIELD: 3,
  /** 每座「已耕作」田地提供的人口承载力（设计文档 §5：K=…+Σ已耕作田×12） */
  CAPACITY_PER_FIELD: 12,
  /** 田地的最低农夫数：不足则田地不产出（"需至少 2 名农夫方可产出"） */
  FIELD_MIN_FARMERS: 2,
  /** 每座粮仓提供的食物上限 */
  GRANARY_PER_UNIT: 800,
  /**
   * 每座粮仓额外提供的**基础建材**容量（木材 / 石头）。
   *
   * 这是「存储建筑双扩容」规则的落地（见 design/game/storage-plan.md §4）：
   * 存储建筑必须同时给 ①本代专精容量（谷物 +800）②**继承资源**的容量。
   *
   * 为什么必须有这一条：`wood` / `stone` 此前是**所有时代硬编码 500**，
   * 而 E3 的起始状态就要求木材 800 / 石头 600（E3 §11.1）、E4 官署要 2,000 木
   * —— 玩家的仓库装不下下一代的入场券，断链。
   *
   * 取 300 的依据：E2 基础上限 500 + **1 座粮仓 ×300 = 800**，
   * 恰好等于 E3 的起始木材 800，断链自然接上。
   */
  GRANARY_WOOD_BONUS: 300,
  GRANARY_STONE_BONUS: 300,
  /** 每座畜栏提供的牲畜存栏上限 */
  PEN_CAPACITY: 20,
  /** 每座畜栏提供的牧人工作位 */
  JOBS_PER_PEN: 3,
  /** 每座陶窑提供的食物上限加成 */
  KILN_BONUS: 0.15,
  /** 陶窑加成生效的最大座数（超出不叠加） */
  KILN_MAX_EFFECTIVE: 3,
  /** 每头牲畜每秒消耗的饲料（食物） */
  FEED_PER_LIVESTOCK_SEC: 0.02,
  /**
   * 定居时代每人每秒消耗的食物。
   *
   * 比 E1 的消耗（0.2）略高：定居时代人口更集中，
   * 且冬季单季消耗 = 人口 × 0.25 × 60 = 人口 × 15（设计文档 §5）。
   */
  FOOD_PER_PERSON_SEC: 0.25,
  /** 宰杀一头牲畜得到的食物 */
  SLAUGHTER_YIELD: 30,
  /** 牲畜世代 3 时的宰杀产量 */
  SLAUGHTER_YIELD_TIER3: 38,
  /**
   * 冬季人口增长率乘数（非负）。
   *
   * 修复「冬季反号」bug：原季节因子冬季为 −0.15（负数），与 foodFactor 相乘后
   * 出现"负×负=正"的反直觉行为（饿肚子冬天人口反而增长，储粮越足掉得越快）。
   * 现改为非负乘数：冬季用 0.4 把增长放慢，但方向完全由食物决定；真正的减员由
   * engine.getPopulationGrowth 的冬季独立减员项表达（见 POPULATION.WINTER_*）。
   */
  WINTER_RATE_MULTIPLIER: 0.4,
} as const;

// ─────────────────────────────────────────────
// 猎人 · 猎场承载力（边际衰减）
// ─────────────────────────────────────────────
/**
 * 场地限制：一片猎场能持续供给的食物总量有**上限**。
 * 猎人越多，单人产出越低，总产出逼近上限（渐近线），而不是线性增长。
 *
 * 公式（engine.calcJobOutput 的 hunter 分支）：
 *   总产出 = HUNT.CAP × (1 − e^(−人数 / HUNT.TAU))
 *   - 1 名猎人 ≈ CAP × (1−e^(−1/TAU)) —— 参数取到接近单人满产 1.2/s
 *   - 人数 → ∞ 时总产出 → CAP，即猎场的"总容量"
 *
 * 设计意图：早期 1–2 名猎人体感几乎不变，堆到 6–8 名后边际收益骤降，
 * 逼玩家转向农业 / 蓄养 —— E2 文档 §7「野生资源耗减是定居的自然后果」
 * 的机制化落地（也解决"E2 里猎人降权 0.4 没有实现点"的遗留缺口）。
 */
export const HUNT = {
  /** 猎场总容量（食物/秒）：总产出的渐近上限 */
  CAP: 6.0,
  /** 饱和常数：TAU 越小，越早进入边际递减 */
  TAU: 4.5,
} as const;

// ─────────────────────────────────────────────
// E3 城邦时代常量（数值源：E3-citystate.md §11）
// ─────────────────────────────────────────────
export const E3 = {
  /** 楔形文字研究前的过渡经验倍率，避免 E2→E3 入口出现研究死锁 */
  BOOTSTRAP_EXP_MULTIPLIER: 0.35,
  /** 记录容量基础（槽位） */
  RECORD_BASE: 3,
  /** 每座学宫提供的记录容量 */
  RECORD_PER_ACADEMY: 5,

  /** 每条贸易路线所需书吏数（「账目分类」→ 30） */
  SCRIBES_PER_ROUTE: 40,
  /** 商队结算周期（秒） */
  TRADE_CYCLE_SEC: 30,
  /** 距离系数：1 + 0.15 × 距离 */
  DISTANCE_COEFF: 0.15,
  /** 没有驴队等护运技术时的单周期基础中断概率 */
  ROUTE_BASE_BREAK_CHANCE: 0.08,
  /** 需求冲击：1 + 0.15 × (近 5 周期累计买入 / 基准供应量) */
  DEMAND_COEFF: 0.15,
  /** 需求冲击观察周期数 */
  DEMAND_WINDOW: 5,
  /** 价格随机波动区间 */
  PRICE_JITTER_MIN: 0.8,
  PRICE_JITTER_MAX: 1.2,
  /** 未研究度量衡时的换算损耗 */
  CONVERSION_LOSS: 0.15,
  /** 每座商栈提供的路线槽位 */
  SLOTS_PER_TRADING_POST: 2,

  /** 契约锁价时长（秒；「契约刻录」×2.4 → 12 分钟） */
  CONTRACT_BASE_SEC: 300,
  /** 契约锁价幅度（±10%） */
  CONTRACT_PRICE_BAND: 0.1,
  /** 契约运力加成 */
  CONTRACT_CAPACITY_BONUS: 0.2,
  /** 契约声望收益 */
  CONTRACT_REP_GAIN: 2,
  /** 毁约声望惩罚 */
  BREACH_REP_LOSS: 15,
  /** 毁约后该邦报价加成（持续 3 分钟） */
  BREACH_PRICE_PENALTY: 0.25,
  BREACH_PENALTY_SEC: 180,

  /** 声望阈值：≥70 全线 −10%；≤20 全线 +25% 且 20% 概率拒交 */
  REP_HIGH: 70,
  REP_HIGH_DISCOUNT: 0.9,
  REP_LOW: 20,
  REP_LOW_PENALTY: 1.25,
  REP_LOW_REFUSE_CHANCE: 0.2,

  /** @deprecated 2026-09-13 已废弃：03-economy-and-growth-plan.md §5 废除通用 N^0.9，职业改声明式分类模型。保留仅为兼容，无引用。 */
  SCALING_EXP: 0.9,

  /** 冶炼投料比：0.045 铜 + 0.005 锡 → 0.05 青铜/秒 */
  SMELT_COPPER_IN: 0.045,
  SMELT_TIN_IN: 0.005,
  SMELT_BRONZE_OUT: 0.05,
  /** 再生冶炼：青铜回收率 */
  RECYCLE_RATE: 0.3,
  /** 熔炉：冶炼工效率加成 */
  FURNACE_BONUS: 0.25,

  /** E3 人口参数（§11.3：r=0.003，K 基础 320，民居 +130，食耗 0.2/秒/人） */
  POP_GROWTH_RATE: 0.003,
  POP_BASE_CAPACITY: 320,
  POP_PER_CITY_HOUSE: 130,
  POP_FOOD_PER_PERSON: 0.2,

  /**
   * 通用仓库 warehouse（E3 建筑，由并行代理在 buildings.ts 定义；
   * 引擎只读 state.buildings.warehouse ?? 0，不在此定义建筑数据）。
   * 每座仓库给「散装建材」木材 / 石头 各 +200。
   */
  WAREHOUSE_BULK_BONUS: 200,
  /**
   * 每座通用仓库给金属 铜 / 锡 / 青铜 各 +400。
   * 金属此前只能靠 city_house×150 扩容、很快顶满 500；仓库提供通用扩容手段。
   */
  WAREHOUSE_METAL_BONUS: 400,

  /**
   * 每座通用仓库给「食物」上限 +600。
   *
   * 食物此前只有 1000×储存倍率 + 粮仓体系扩容，E3 人口 300+、季节压力更大，
   * 单靠粮仓不够撑过冬季。仓库提供通用食物扩容手段。
   * 仅在 seasonsEnabled 分支生效（E1 无仓库、E2 仓库是 E3 建筑不可建，故不影响旧时代）。
   */
  WAREHOUSE_FOOD_BONUS: 600,

  /** 贸易基准价（食物=1，价值尺度；2026-09-13 起全部物资可贸易，补齐牲畜/织物） */
  BASE_PRICES: {
    food: 1,
    wood: 2,
    stone: 3,
    livestock: 6,
    fabric: 8,
    copper: 12,
    tin: 150,
    bronze: 30,
    lapis: 200,
  } as const,

  /** E3 起始状态（§11.1） */
  START: {
    population: 260,
    food: 2000,
    wood: 800,
    stone: 600,
    reputation: 50,
  } as const,
} as const;

// ─────────────────────────────────────────────
// E4 帝国时代常量（首轮可玩闭环）
// ─────────────────────────────────────────────
export const E4 = {
  IRON_MINER_RATE: 0.4,
  COIN_MINT_RATE: 0.4,
  MINT_IRON_PER_COIN: 0.2,
  MINT_WORKERS_PER_BUILDING: 20,
  LEGION_FOOD_PER_SEC: 0.8,
  LEGION_COIN_PER_SEC: 0.2,
  MAX_TERRITORY: 24,
  BASE_TERRITORY_CAPACITY: 60,
  EXPANSION_COIN_BASE: 600,
  EXPANSION_COIN_EXP: 1.25,
  EXPANSION_IRON_BASE: 160,
  EXPANSION_IRON_EXP: 1.08,
  EXPANSION_LEGION_BASE: 2,
  EXPANSION_LEGION_PER_TERRITORY: 0.75,
  EXPANSION_FLAT_BASE_SEC: 15,
  EXPANSION_FLAT_PER_TERRITORY_SEC: 2,
  IRON_STORAGE_BASE: 1000,
  IRON_STORAGE_PER_TERRITORY: 350,
  ARMORY_IRON_STORAGE: 1200,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// E5 远洋时代
//
// 数值依据：design/game/eras/E5-maritime.md §11（11.1–11.8）。
// 核心机制是「知识复利」：研究速度 = 印刷产能 × 复利倍率 R(N) × 识字率因子，
// 其中 R = 1 + k × N_eff，N 是**本时代**已解锁的 E5 科技数（跨代归零）。
//
// ⚠️ R 不得缓存进 state —— 它是 (N, k) 的纯函数，每个 tick 现算，
//    这样「刚研究完一项科技，下一 tick 研究速度立刻变大」才成立。
// TODO(balance)：以下数值取自设计文档 §11，尚未经 autoplay e5 实测校准。
// ─────────────────────────────────────────────────────────────────────────────
export const E5 = {
  // ── §11.2 知识复利 ──
  /** 复利系数基数 k（印刷术） */
  COMPOUND_K_BASE: 0.05,
  /** k 的加项总和上限：金属活字/大学制度/印坊分工/科学方法 */
  COMPOUND_K_MAX_BONUS: 0.05,
  /** 复利倍率绝对上限 ×4.20（§11.2 硬顶） */
  COMPOUND_R_CAP: 4.2,
  /** N_eff 第一段上限（N ≤ 20 时 N_eff = N） */
  NEFF_SEG1_MAX: 20,
  /** N_eff 第二段上限 */
  NEFF_SEG2_MAX: 35,
  /** 第二段斜率：每多 1 项科技只算 0.5 */
  NEFF_SEG2_SLOPE: 0.5,
  /** 第三段斜率：每多 1 项科技只算 0.25 */
  NEFF_SEG3_SLOPE: 0.25,
  /** N_eff 硬上限（闸门二） */
  NEFF_CAP: 32,

  // ── §11.3 识字率 ──
  /** 识字率起始值（%）——不是 0，远洋时代不是文盲开局 */
  LITERACY_START: 12,
  /** 识字率基础增长速率（/秒） */
  LITERACY_GROWTH: 0.0008,
  /** 教师对识字率增长的乘数 */
  LITERACY_TEACHER_MUL: 1.3,
  /** 每座大学提升的识字率上限 */
  LITERACY_CAP_PER_UNIVERSITY: 0.15,
  /** 识字率上限基数 */
  LITERACY_CAP_BASE: 0.15,
  /** 识字率上限硬顶 */
  LITERACY_CAP_MAX: 0.95,
  /** 识字率因子：factor = 0.70 + 0.60 × lit */
  LITERACY_FACTOR_BASE: 0.7,
  LITERACY_FACTOR_SLOPE: 0.6,

  // ── §11.4 人口 ──
  /** E5 基础人口增长率（/秒） */
  POP_GROWTH_BASE: 0.0012,
  /** E5 基础 K 上限 */
  POP_K_BASE: 300,
  /** 每座住所提供的 K */
  POP_K_PER_HOUSE: 60,
  /** 新作物（马铃薯）提供的 K 上限加成 */
  POP_K_POTATO: 150,

  // ── §11.6 远航 ──
  /** 各环时长（秒）：近海 / 远洋 / 环球 */
  VOYAGE_DURATION: { 1: 60, 2: 180, 3: 480 } as Record<1 | 2 | 3, number>,
  /** 每名水手每秒推进的进度 */
  VOYAGE_PROGRESS_PER_SAILOR: 1.0,
  /** 各环水手需求 */
  VOYAGE_SAILORS: { 1: 5, 2: 12, 3: 25 } as Record<1 | 2 | 3, number>,
  /** 各环物料成本 */
  VOYAGE_COST: {
    1: { wood: 40, iron: 20 },
    2: { wood: 120, iron: 60, silver: 50 },
    3: { wood: 300, iron: 150, silver: 200 },
  } as Record<1 | 2 | 3, Record<string, number>>,
  /** 识字率对远航成功率的加成（每 1.0 识字率） */
  VOYAGE_LITERACY_BONUS: 0.1,
  /** 首次完成第 2 环的「发现新大陆」奖励 */
  NEW_WORLD_REWARD: {
    exoticGoods: 80, silver: 300, researchPoints: 5000, foodMul: 1.15, kCapMul: 1.1,
  },

  // ── §11.5 印刷里程碑（按**累计产量**，不是当前库存）──
  PRINT_MILESTONES: [
    { at: 5000, id: 'alloy_type', desc: '铅锡锑合金：印刷 +20%' },
    { at: 20000, id: 'workshop_division', desc: '印坊分工：印书坊工位 +4' },
    { at: 60000, id: 'k_bonus_1', desc: 'k +0.01' },
    { at: 200000, id: 'double_press', desc: '双人压印机：印刷 +50%' },
    { at: 600000, id: 'k_bonus_2', desc: 'k +0.01' },
  ],

  // ── §11.7 建筑加成 ──
  /** 图书馆提供的典籍存储 */
  LIBRARY_BOOK_STORAGE: 20000,
  /** 图书馆提供的研究速度加成 */
  LIBRARY_RESEARCH_BONUS: 0.05,
  /** 造纸坊 / 印书坊的产出加成 */
  PAPER_MILL_BONUS: 0.15,
  PRINTING_WORKSHOP_BONUS: 0.2,

  // ── §11.8 跃迁 ──
  /** 跃迁所需的远航最高环 */
  ADVANCE_VOYAGE_RING: 2,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// E6 机器时代
//
// 数值依据：design/game/eras/E6-machine.md §11 + E6-devplan.md §3.2。
// 核心机制是「能量链」：煤 → 热 → 机械能 → 电 → 工厂，**每加一环损耗一次 η 乘法**。
// 玩家优化的不是"有多少煤"，而是"每一环漏掉多少"——这是本代的主计分板。
//
// 两条路径（§3.2，devplan 已把 §1.2 链式效率与 §3.1 电网 G/D 统一为单一算法）：
//   直驱：  总效率 = η₁ × η₂ × η_trans(n)，    η_trans = 1/(1 + 0.08n)
//   电气化：总效率 = η₁ × η₂ × η₃ × η₄ × η₅
// 其中 η_trans 随工厂数下降 —— 这是设计上的反直觉点：**直驱时厂越多越亏**
// （瓦特 6 厂直驱 2.74% < 纽科门 1 厂 3.75%），逼玩家走电气化。
//
// TODO(balance)：以下数值取自设计文档 §11，尚未经 autoplay e6 实测校准。
// ─────────────────────────────────────────────────────────────────────────────
export const E6 = {
  // ── §11.2 η 效率表（全部可在 UI 悬停查看来源）──
  /** η₁ 锅炉热效率；研究「焦炭冶炼」后提升 */
  ETA_BOILER: 0.45,
  ETA_BOILER_COKE: 0.495,
  /**
   * η₂ 蒸汽机世代效率（含压力档位惩罚）。
   *
   * ⚠️ 这是能量链里**最陡的一段**：纽科门 2% → 高压复式 22%，整整 11 倍。
   *    因此 E6 的效率科技（斯米顿/分离冷凝器/高压/复式）优先级远高于产能扩张。
   */
  ETA_STEAM: {
    /** 纽科门机 —— 只能抽水，热效率惨不忍睹 */
    I: 0.02,
    /** 斯米顿改良 —— 单次改进就让效率翻倍有余 */
    I5: 0.045,
    /** 分离冷凝器（瓦特） */
    III: 0.09,
    /** 高压 + 复式膨胀 */
    IV: 0.22,
  } as Record<string, number>,
  /** η₃ 发电机（法拉第电磁感应） */
  ETA_GENERATOR: 0.85,
  /** η₄ 输电效率：直流 / 交流 / 高压交流 */
  ETA_TRANSMIT: { dc: 0.78, ac: 0.88, hvac: 0.94 } as Record<string, number>,
  /** η₅ 电动机 */
  ETA_MOTOR: 0.88,
  /**
   * 压力不足档位时的喘振惩罚。
   *
   * ⚠️ 设计意图：压力表是本代的"火种"——不是装饰。司炉工不足会让压力掉档，
   *    η₂ 被拦腰砍到 40%，总效率骤降。这是唯一能同时体现"司炉工是必需岗位"
   *    与"压力仪表盘值得盯"的机制，T5 需实测掉档曲线是否可感知。
   */
  SURGE_PENALTY: 0.4,

  // ── §11.3 能量换算（统一口径，devplan 矛盾 2 已拍板）──
  /** 1 煤 = 100 kW·秒 */
  COAL_KW_PER_UNIT: 100,
  /**
   * 每座工厂的机械能需求（**轴端口径**）。
   *
   * ⚠️ 与 FACTORY_ELEC_KW 的分工（devplan §4.2 拍板）：60 是产能计算的真口径，
   *    150 只是电网端含电动机/传输开销的读数。若两表各算一遍会**重复折扣**。
   */
  FACTORY_MECH_KW: 60,
  /** 每座工厂耗电（电网端，含电动机/传输开销）——仅电气化模式计入 D */
  FACTORY_ELEC_KW: 150,
  /** 每台蒸汽机机械能产能（kW） */
  STEAM_ENGINE_KW: 110,
  /** 每座发电厂电力产能（kW） */
  POWER_PLANT_KW: 190,
  /** 直驱传动轴摩擦系数：η_trans = 1/(1 + 0.08n) */
  LINE_SHAFT_FRICTION: 0.08,

  // ── §11.4 蒸汽压力（本代视觉主角）──
  /** 压力自然衰减速率（/秒），每座锅炉房减缓 15% */
  PRESSURE_DECAY: 1.5,
  /** 锅炉房对衰减的减免比例 */
  PRESSURE_BOILER_RELIEF: 0.15,
  /** 压力上限基数 */
  PRESSURE_CAP_BASE: 100,
  /** 每座锅炉房提升的压力上限 */
  PRESSURE_CAP_PER_BOILER: 20,
  /** 司炉工每人维持的煤流量（煤/秒）——同时也是烧煤上限 */
  STOKER_COAL_PER_SEC: 5,
  /**
   * 压力档位阈值（§11.4）。
   * 静止 0 / 微压 1–33 / 常压 34–66 / 高压 67–100。
   * 各蒸汽机世代有**所需档位**：世代越高越吃压力，掉档即喘振。
   */
  PRESSURE_TIERS: { idle: 0, low: 33, normal: 66, high: 100 } as const,
  /** 各蒸汽机世代所需的压力档位下限（低于此值触发喘振 ×0.4） */
  PRESSURE_REQUIRED: { I: 1, I5: 34, III: 34, IV: 67 } as Record<string, number>,

  // ── §11.5 电网 ρ（朴素版单区；E7 升级为主干多区）──
  /** 每座工人住宅耗电（kW）——仅电气化模式计 */
  HOUSING_ELEC_KW: 2,
  /** 每座锅炉房耗电（kW）——仅电气化模式计 */
  BOILER_ELEC_KW: 15,
  /** ρ 满速阈值 */
  RHO_FULL: 1,
  /** ρ 降速阈值：0.6 ≤ ρ < 1 全厂 ×ρ */
  RHO_BROWNOUT: 0.6,
  /** ρ 拉闸阈值：0.2 ≤ ρ < 0.6 追加 r×0.7 */
  RHO_BLACKOUT: 0.2,
  /** 电网崩溃时的产出乘数（蒸汽冗余接管） */
  RHO_COLLAPSE_OUTPUT: 0.3,
  /** 拉闸时人口增长率 r 的额外惩罚 */
  BROWNOUT_R_PENALTY: 0.7,

  // ── §11.6 工厂产出 ──
  /** 每座工厂的基础工业品产出（/秒，满供给时） */
  FACTORY_BASE_OUTPUT: 6,
  /** 规模系数斜率：1 + 0.20 × min(工厂数, 15) */
  SCALE_SLOPE: 0.2,
  /** 规模系数上限所对应的工厂数（第 16 座起不再增益） */
  SCALE_MAX_FACTORIES: 15,

  // ── §11.7 城市化与污染（r 的两个负向因子）──
  /** 城市化拥挤系数表：U 上限 → 系数 */
  CROWDING_TABLE: [
    { maxU: 0.4, coef: 1.0 },
    { maxU: 0.55, coef: 0.9 },
    { maxU: 0.7, coef: 0.75 },
    { maxU: 0.85, coef: 0.6 },
    { maxU: 1.01, coef: 0.45 },
  ] as ReadonlyArray<{ maxU: number; coef: number }>,
  /** 每座工厂每秒钟的污染累积 */
  POLLUTION_PER_FACTORY: 0.008,
  /** 污染值上限（卫生因子 = 1 − Pol/250，故 100 时仍有 0.6） */
  POLLUTION_CAP: 250,
  /** 「公共卫生法」的污染减免 */
  POLLUTION_REDUCE_SANITATION: 0.75,
  /** 「城市排水系统」的污染减免 */
  POLLUTION_REDUCE_SEWER: 0.8,
  /** E6 基础人口增长率（/秒） */
  POP_GROWTH_BASE: 0.02,
  /** E6 基础 K */
  POP_K_BASE: 900,
  /** 每座工人住宅提供的 K */
  POP_K_PER_HOUSING: 200,
  /**
   * E6 关闭季节摆动（工业不看天吃饭）。
   * 食物因子仍按存量判定 —— 工业化不等于粮食无限。
   */
  SEASON_R: 1,

  // ── §11.8 知识产出 ──
  /** 每人知识产出基数 */
  KNOWLEDGE_PER_POP: 0.3,
  /** 复利斜率：1 + 0.03N（N = 已研究 E6 科技数，从 0 起步） */
  KNOWLEDGE_COMPOUND_SLOPE: 0.03,

  // ── §11.9 铁路工程（可升级工程系统，非点状建筑）──
  RAILROAD: {
    1: { transportLossReduce: 0.15, capacityBonus: 0.1, gridZones: 0 },
    2: { transportLossReduce: 0.28, capacityBonus: 0.2, gridZones: 0 },
    3: { transportLossReduce: 0.4, capacityBonus: 0.3, gridZones: 1 },
  } as Record<number, { transportLossReduce: number; capacityBonus: number; gridZones: number }>,

  // ── §11.10 跃迁（六项）──
  /** 钢存量门槛 */
  ADVANCE_STEEL: 200000,
  /** 工厂座数门槛 */
  ADVANCE_FACTORIES: 15,
  /** 供电率门槛 */
  ADVANCE_RHO: 0.9,
  /** 人口门槛 */
  ADVANCE_POPULATION: 3600,
  /** 城市化率门槛 */
  ADVANCE_URBANIZATION: 0.7,
} as const;
