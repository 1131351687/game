// E1 远古时代 · 科技树（20 项）
// 结构：1 主干 + 3 分支 + 汇聚到门槛科技
//
// 布局坐标：x 负值=火之技艺分支，0=中间，正值=群体与定居；y 由下往上生长
// position 供科技树界面直接使用，无需运行时计算布局

import type { JobId } from './jobs';
import type { BuildingId } from './buildings';

/** 科技所属分支 */
export type TechBranch = 'core' | 'fire' | 'tool' | 'society' | 'gate';

/** 科技类型（设计规范：解锁 ≥40% / 质变 ≥25% / 数值 ≤25%） */
export type TechType = 'unlock' | 'qualitative' | 'numeric' | 'gate';

export interface TechEffects {
  /** 开启火种系统 */
  enableFire?: boolean;
  /** 允许主动补充火种 */
  activeFireRestore?: boolean;
  /** 火种衰减乘数（<1 为减缓） */
  fireDecayMultiplier?: number;
  /** 火种上限加成 */
  fireMaxBonus?: number;
  /** 微弱档不再有食物惩罚 */
  removeWeakFoodPenalty?: boolean;
  /** 食物产出乘数 */
  foodMultiplier?: number;
  /** 石头产出乘数 */
  stoneMultiplier?: number;
  /** 经验产出乘数 */
  expMultiplier?: number;
  /** 采集者效率乘数 */
  gathererMultiplier?: number;
  /** 设置工具世代等级 */
  setToolTier?: number;
  /** 建筑成本乘数 */
  buildingCostMultiplier?: number;
  /** 社会稳定度（降低损失事件） */
  stabilityBonus?: number;
  /** 集体围猎：猎人数阈值 */
  huntPartyThreshold?: number;
  /** 集体围猎：超阈值的效率加成 */
  huntPartyBonus?: number;
  /** 食物存储上限倍率 */
  foodStorageMultiplier?: number;
  /** 解锁岗位 */
  unlockJobs?: JobId[];
  /** 解锁建筑 */
  unlockBuildings?: BuildingId[];
  /** 解锁时代跃迁 */
  enableAdvance?: boolean;
}

export interface TechDef {
  id: string;
  name: string;
  icon: string;
  branch: TechBranch;
  cost: number;
  type: TechType;
  /** 前置科技 id（全部满足，AND 逻辑） */
  requires: string[];
  /** 任选其一满足的前置（OR 逻辑，用于三分支汇聚） */
  requiresAny?: string[];
  effects: TechEffects;
  /** 界面布局坐标 */
  position: { x: number; y: number };
  /** 一句话说明（含"为什么"） */
  desc: string;
}

export const TECHS: TechDef[] = [
  // ─────────────── 核心 ───────────────
  {
    id: 'fire_mastery',
    name: '掌握火',
    icon: '🔥',
    branch: 'core',
    cost: 10,
    type: 'unlock',
    requires: [],
    effects: { enableFire: true },
    position: { x: 0, y: 0 },
    desc: '人类第一次支配自然力。开启火种系统——火会持续衰减，必须投入木材维持。',
  },

  // ─────────────── 分支 A · 火之技艺 ───────────────
  {
    id: 'fire_starting',
    name: '取火术',
    icon: '✨',
    branch: 'fire',
    cost: 30,
    type: 'qualitative',
    requires: ['fire_mastery'],
    effects: { activeFireRestore: true },
    position: { x: -2, y: 1 },
    desc: '以黄铁矿敲击燧石取火。不再只能被动等待，可主动补充火种。',
  },
  {
    id: 'cooking',
    name: '熟食烹饪',
    icon: '🍲',
    branch: 'fire',
    cost: 45,
    type: 'numeric',
    requires: ['fire_starting'],
    effects: { foodMultiplier: 1.25 },
    position: { x: -2, y: 2 },
    desc: '加热使食物更易消化，营养吸收率提升。食物产出 +25%。',
  },
  {
    id: 'hearth_construction',
    name: '火塘营造',
    icon: '🏕️',
    branch: 'fire',
    cost: 75,
    type: 'unlock',
    requires: ['cooking'],
    effects: { unlockBuildings: ['hearth'] },
    position: { x: -2, y: 3 },
    desc: '垒石为塘，火不再随营地迁移而熄灭。解锁建筑：火塘。',
  },
  {
    id: 'hot_rock_cooking',
    name: '热石煮食',
    icon: '🪨',
    branch: 'fire',
    cost: 110,
    type: 'qualitative',
    requires: ['hearth_construction'],
    effects: { removeWeakFoodPenalty: true },
    position: { x: -2, y: 4 },
    desc: '以烧热的石块烹煮，无需明火也能加工食物。火种微弱时不再有食物惩罚。',
  },
  {
    id: 'torch',
    name: '火把',
    icon: '🕯️',
    branch: 'fire',
    cost: 130,
    type: 'numeric',
    requires: ['hot_rock_cooking'],
    effects: { expMultiplier: 1.25 },
    position: { x: -2, y: 5 },
    desc: '火光延长了夜晚的活动时间，族人得以围坐讲述与传授。经验产出 +25%。',
  },
  {
    id: 'fire_preservation',
    name: '火种保存术',
    icon: '🫙',
    branch: 'fire',
    cost: 170,
    type: 'qualitative',
    requires: ['torch'],
    effects: { fireMaxBonus: 30 },
    position: { x: -2, y: 6 },
    desc: '用余烬与干苔藓保存火种。火种上限 +30，为更长时间的无人看管留出余地。',
  },

  // ─────────────── 分支 B · 石器与工具 ───────────────
  {
    id: 'stone_knapping',
    name: '石器打制',
    icon: '🔨',
    branch: 'tool',
    cost: 35,
    type: 'unlock',
    requires: ['fire_mastery'],
    effects: { unlockJobs: ['knapper'], unlockBuildings: ['workshop'] },
    position: { x: 0, y: 1 },
    desc: '以石击石，打出锐利的边缘。解锁岗位：打石者；解锁建筑：作坊。',
  },
  {
    id: 'wooden_spear',
    name: '削尖木矛',
    icon: '🗡️',
    branch: 'tool',
    cost: 60,
    type: 'unlock',
    requires: ['stone_knapping'],
    effects: { setToolTier: 1, unlockJobs: ['hunter'] },
    position: { x: 0, y: 2 },
    desc: '火烤削尖的木矛，重心靠前可投掷。解锁岗位：猎人（效率是采集者的 2.4 倍）。',
  },
  {
    id: 'flint_selection',
    name: '燧石选材',
    icon: '💎',
    branch: 'tool',
    cost: 95,
    type: 'numeric',
    requires: ['wooden_spear'],
    effects: { stoneMultiplier: 1.3 },
    position: { x: 0, y: 3 },
    desc: '辨识优质石料，减少废料。石头产出 +30%。',
  },
  {
    id: 'hafting',
    name: '装柄技术',
    icon: '🪵',
    branch: 'tool',
    cost: 120,
    type: 'unlock',
    requires: ['flint_selection'],
    effects: { setToolTier: 2 },
    position: { x: 0, y: 4 },
    desc: '以树脂黏合石尖与木柄。工具世代提升至「装柄石矛」，狩猎效率 +40%。',
  },
  {
    id: 'atlatl',
    name: '投矛器',
    icon: '🎯',
    branch: 'tool',
    cost: 185,
    type: 'unlock',
    requires: ['hafting'],
    effects: { setToolTier: 3 },
    position: { x: 0, y: 5 },
    desc: '杠杆延长了手臂。工具世代提升至「投矛器」，狩猎效率再 +40%。',
  },
  {
    id: 'bow_and_arrow',
    name: '弓箭',
    icon: '🏹',
    branch: 'tool',
    cost: 265,
    type: 'unlock',
    requires: ['atlatl'],
    effects: { setToolTier: 4 },
    position: { x: 0, y: 6 },
    desc: '蓄力于弦，远程制敌。工具世代提升至「弓箭」，狩猎效率 +60%。',
  },

  // ─────────────── 分支 C · 群体与定居 ───────────────
  {
    id: 'shelter_building',
    name: '住所营造',
    icon: '🏠',
    branch: 'society',
    cost: 45,
    type: 'unlock',
    requires: ['fire_mastery'],
    effects: { unlockBuildings: ['house'] },
    position: { x: 2, y: 1 },
    desc: '以木骨覆兽皮搭棚。解锁建筑：住所（每座提升人口上限 4）。',
  },
  {
    id: 'group_cooperation',
    name: '群体协作',
    icon: '🤝',
    branch: 'society',
    cost: 90,
    type: 'qualitative',
    requires: ['shelter_building'],
    effects: { gathererMultiplier: 1.3 },
    position: { x: 2, y: 2 },
    desc: '从各自为战到分工协作，共享采集所得。采集者效率 +30%。',
  },
  {
    id: 'rope_weaving',
    name: '绳索编织',
    icon: '🪢',
    branch: 'society',
    cost: 145,
    type: 'numeric',
    requires: ['group_cooperation'],
    effects: { buildingCostMultiplier: 0.85 },
    position: { x: 2, y: 3 },
    desc: '以植物纤维搓绳，用于捆扎与牵引。建筑成本 −15%。',
  },
  {
    id: 'ochre_pigment',
    name: '赭石颜料',
    icon: '🎨',
    branch: 'society',
    cost: 160,
    type: 'qualitative',
    requires: ['rope_weaving'],
    effects: { stabilityBonus: 1 },
    position: { x: 2, y: 4 },
    desc: '以赭石涂身、标记族群。共同的身份让群体更稳固，损失事件减少。',
  },
  {
    id: 'collective_hunt',
    name: '集体围猎',
    icon: '🐎',
    branch: 'society',
    cost: 205,
    type: 'qualitative',
    requires: ['ochre_pigment'],
    effects: { huntPartyThreshold: 5, huntPartyBonus: 0.4 },
    position: { x: 2, y: 5 },
    desc: '把兽群逼向湖岸与崖边。猎人数达 5 人时，全员效率 +40%。',
  },
  {
    id: 'smoking_storage',
    name: '烟熏储存',
    icon: '🍖',
    branch: 'society',
    cost: 230,
    type: 'qualitative',
    requires: ['collective_hunt'],
    effects: { foodStorageMultiplier: 2 },
    position: { x: 2, y: 6 },
    desc: '烟熏与风干让肉类可以长期保存。食物存储上限翻倍。',
  },

  // ─────────────── 门槛 ───────────────
  {
    id: 'plant_cultivation',
    name: '植物栽培',
    icon: '🌾',
    branch: 'gate',
    cost: 300,
    type: 'gate',
    requires: [],
    // OR 逻辑：三条分支任一走通即可跃迁
    // （若用 AND，需 2505 经验才能到门槛，但 20 分钟只能获得 1870，会卡死）
    requiresAny: ['fire_preservation', 'bow_and_arrow', 'smoking_storage'],
    effects: { enableAdvance: true },
    position: { x: 0, y: 7 },
    desc: '不再跟着食物走，而是让食物长在门口。解锁时代跃迁——迈向定居时代（需走通任一条分支）。',
  },
];

export const TECH_MAP: Record<string, TechDef> = Object.fromEntries(
  TECHS.map(t => [t.id, t])
);

export const TECHS_BY_BRANCH: Record<TechBranch, TechDef[]> = {
  core: TECHS.filter(t => t.branch === 'core'),
  fire: TECHS.filter(t => t.branch === 'fire'),
  tool: TECHS.filter(t => t.branch === 'tool'),
  society: TECHS.filter(t => t.branch === 'society'),
  gate: TECHS.filter(t => t.branch === 'gate'),
};

/** 科技类别在「文明」模块中的元数据 */
export interface BranchMeta {
  /** 类别名 */
  name: string;
  /** 层级：core=文明之光（起点）｜branch=三条发展分支｜gate=时代之门（终点） */
  kind: 'core' | 'branch' | 'gate';
  /** 在模块中的显示顺序（由小到大） */
  order: number;
  /** 主色 */
  color: string;
  /** 一句话说明这条路线的特点 */
  desc: string;
  /** 层级标签（显示在类别标题右侧） */
  role: string;
}

export const BRANCH_INFO: Record<TechBranch, BranchMeta> = {
  core: {
    name: '文明之光',
    kind: 'core',
    order: 0,
    color: '#facc15',
    desc: '一切的起点。掌握它，文明才真正开始',
    role: '核心',
  },
  fire: {
    name: '火之技艺',
    kind: 'branch',
    order: 1,
    color: '#f97316',
    desc: '食物效率与火种强度',
    role: '分支 · 稳健',
  },
  tool: {
    name: '石器与工具',
    kind: 'branch',
    order: 2,
    color: '#3b82f6',
    desc: '狩猎效率，省下人力',
    role: '分支 · 效率',
  },
  society: {
    name: '群体与定居',
    kind: 'branch',
    order: 3,
    color: '#22c55e',
    desc: '人口上限与群体稳定',
    role: '分支 · 规模',
  },
  gate: {
    name: '时代之门',
    kind: 'gate',
    order: 4,
    color: '#a855f7',
    desc: '通往下一个时代',
    role: '门槛',
  },
};

/** 按层级顺序排列的类别（文明之光 → 三条分支 → 时代之门） */
export const BRANCH_ORDER: TechBranch[] = ['core', 'fire', 'tool', 'society', 'gate'];

/** 全部科技总成本（用于配平校验，应为 2505） */
export const TOTAL_TECH_COST = TECHS.reduce((sum, t) => sum + t.cost, 0);
