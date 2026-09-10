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
  /** 基础增长率（每秒）—— 首轮实测 0.02 太慢，20 分钟只到 11.7 人，调到 0.03 */
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
export const QUEUE = {
  /** 队列长度上限 */
  MAX_LENGTH: 5,
  /** 离线研究效率 */
  OFFLINE_EFFICIENCY: 0.5,
  /** 离线收益上限（秒）= 8 小时 */
  OFFLINE_CAP_SEC: 8 * 3600,
} as const;

// ─────────────────────────────────────────────
// 时代跃迁条件（E1 → E2）
// ─────────────────────────────────────────────
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
