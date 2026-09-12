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

  /** 规模递减指数（实际产能 = 单位产出 × N^0.9，E3 起） */
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

  /** 贸易基准价（食物=1，价值尺度） */
  BASE_PRICES: {
    food: 1,
    wood: 2,
    stone: 3,
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
