// E1 远古时代 · 科技树（20 项）
// 结构：1 主干 + 3 分支 + 汇聚到门槛科技
//
// 布局坐标：x 负值=火之技艺分支，0=中间，正值=群体与定居；y 由下往上生长
// position 供科技树界面直接使用，无需运行时计算布局

import type { EraId } from './era';
import type { JobId } from './jobs';
import type { BuildingId } from './buildings';
import type { ResourceId } from './resources';

// E2 定居时代科技片段（各 9–10 项，分开维护便于配平与复盘）
import { E2_TECHS_FARMING } from './e2-techs-farming';
import { E2_TECHS_HERDING } from './e2-techs-herding';
import { E2_TECHS_SETTLEMENT } from './e2-techs-settlement';

/**
 * 科技所属分支。
 *
 * - E1 远古时代：core(文明之光·火) / fire / tool / society / gate
 * - E2 定居时代：core(文明之光·农业) / farming / herding / settlement / gate
 *
 * `core` 与 `gate` 是跨时代共用的「层级」——每个时代各有自己的核心科技与门槛科技，
 * 但在文明模块中都归入"文明之光"与"时代之门"两档；三条发展分支则各时代不同名。
 * UI 依据「当前时代实际用到的分支」动态渲染，因此这里可以放全部 8 个取值。
 */
export type TechBranch =
  | 'core'
  | 'fire'
  | 'tool'
  | 'society'
  | 'farming'
  | 'herding'
  | 'settlement'
  | 'gate';

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

  // ─────────────────────────────────────────────
  // E2 定居时代（核心科技：农业）
  //
  // 命名约定：
  //  - `*Mul` / `*Multiplier` 结尾 = 乘法键，聚合方式 1+(m-1)×衰减系数
  //  - `*Add`  结尾            = 加法键，聚合方式 v×衰减系数
  //  - `*Cap` / `*Tier` / `*PerUnit` = 绝对设置键，取"已研究科技中的最大值"
  // ─────────────────────────────────────────────

  /** 开启季节循环（农业核心科技） */
  enableSeasons?: boolean;
  /** 春季农业倍率加成（加在季节基础值 0.5 之上） */
  springAgriMul?: number;
  /** 夏季农业倍率加成（基础值 1.0） */
  summerAgriMul?: number;
  /** 秋季农业倍率加成（基础值 2.5） */
  autumnAgriMul?: number;
  /** 冬季农业倍率加成（基础值 0.05） */
  winterAgriMul?: number;
  /** 食物总产出乘数（原为谷物，2026-09-12 合并） */
  grainMultiplier?: number;
  /** 按岗位的效率乘数（跨时代通用，例：{ farmer: 1.25 }） */
  jobMultiplier?: Partial<Record<JobId, number>>;
  /** 按资源的产出乘数 */
  resourceMultiplier?: Partial<Record<ResourceId, number>>;
  /** 解锁资源 */
  unlockResources?: ResourceId[];

  /** 牲畜产食物乘数（乳/肉） */
  livestockFoodMul?: number;
  /** 夏季牧人效率乘数 */
  summerHerderMul?: number;
  /** 每座畜栏的存栏上限加成 */
  penCapacityAdd?: number;
  /** 牲畜世代等级（绝对设置，取最大） */
  livestockTier?: number;
  /** 饥荒时牲畜存活率（1=全活，0.5=死一半） */
  livestockFamineSurvival?: number;

  /** 田地出产乘数 */
  fieldYieldMul?: number;
  /** 田地效率上限（绝对设置，取最大） */
  fieldEfficiencyCap?: number;
  /** 饲料成本乘数（<1 为降低） */
  feedCostMultiplier?: number;

  /** 村落民居成本乘数 */
  villageHouseCostMul?: number;
  /** 单座粮仓容量（绝对设置，取最大） */
  granaryPerUnit?: number;
  /** 粮仓总容量乘数 */
  granaryCapacityMul?: number;
  /** 陶窑容量加成（绝对设置，取最大） */
  kilnBonus?: number;
  /** 粮仓溢出阈值加成 */
  granaryOverflowBonus?: number;
  /** 岗位切换成本乘数（<1 为降低） */
  jobSwitchCostMul?: number;
  /** 取消 E1 承载力硬顶（定居营造） */
  removeCapacityCap?: boolean;
}

export interface TechDef {
  /** 科技唯一 id */
  id: string;
  /** 显示名称 */
  name: string;
  /** UI 图标（emoji） */
  icon: string;
  /** 所属分支 */
  branch: TechBranch;
  /** 研究所需经验值 */
  cost: number;
  /** 科技类型 */
  type: TechType;
  /** 所属时代（标记数据归属，不改变运行时行为） */
  era: EraId;
  /** 前置科技 id（全部满足，AND 逻辑） */
  requires: string[];
  /** 任选其一满足的前置（OR 逻辑，用于三分支汇聚） */
  requiresAny?: string[];
  effects: TechEffects;
  /** 界面布局坐标 */
  position: { x: number; y: number };
  /** 方块网格里显示的极短标签（1–2 字，关图标模式时使用）。同一时代内不重复，跨时代允许重复 */
  short: string;
  /** 一句话说明（含"为什么"） */
  desc: string;
}

/** E1 远古时代 · 全部 20 项科技 */
const E1_TECHS: TechDef[] = [
  // ─────────────── 核心 ───────────────
  {
    id: 'fire_mastery',
    name: '掌握火',
    short: '火',
    icon: '🔥',
    branch: 'core',
    era: 'E1',
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
    short: '取火',
    icon: '✨',
    branch: 'fire',
    era: 'E1',
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
    short: '烹饪',
    icon: '🍲',
    branch: 'fire',
    era: 'E1',
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
    short: '火塘',
    icon: '🏕️',
    branch: 'fire',
    era: 'E1',
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
    short: '石煮',
    icon: '🪨',
    branch: 'fire',
    era: 'E1',
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
    short: '炬',
    icon: '🕯️',
    branch: 'fire',
    era: 'E1',
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
    short: '余烬',
    icon: '🫙',
    branch: 'fire',
    era: 'E1',
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
    short: '打制',
    icon: '🔨',
    branch: 'tool',
    era: 'E1',
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
    short: '木矛',
    icon: '🗡️',
    branch: 'tool',
    era: 'E1',
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
    short: '燧',
    icon: '💎',
    branch: 'tool',
    era: 'E1',
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
    short: '装柄',
    icon: '🪵',
    branch: 'tool',
    era: 'E1',
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
    short: '投杆', // 旧"投矛"与"木矛"同以"矛"收尾、只差一字；改"投杆"强调投矛器为延长手臂的杠杆/杆
    icon: '🎯',
    branch: 'tool',
    era: 'E1',
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
    short: '弓箭',
    icon: '🏹',
    branch: 'tool',
    era: 'E1',
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
    short: '住所',
    icon: '🏠',
    branch: 'society',
    era: 'E1',
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
    short: '协作',
    icon: '🤝',
    branch: 'society',
    era: 'E1',
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
    short: '绳索',
    icon: '🪢',
    branch: 'society',
    era: 'E1',
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
    short: '赭石',
    icon: '🎨',
    branch: 'society',
    era: 'E1',
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
    short: '围猎',
    icon: '🐎',
    branch: 'society',
    era: 'E1',
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
    short: '烟熏',
    icon: '🍖',
    branch: 'society',
    era: 'E1',
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
    short: '栽培',
    icon: '🌾',
    branch: 'gate',
    era: 'E1',
    cost: 300,
    type: 'gate',
    // AND 前置：栽培需要「石器」（翻土/收割的工具）与「绳索」（捆束/系留）——
    // 光认识植物还不够，得有工具和把收成捆回家的手段。
    // 这样「群体与定居」分支也被拉进关键路径，门槛真正成为三条分支的汇聚点。
    requires: ['stone_knapping', 'rope_weaving'],
    // OR 逻辑：三条分支任一走通即可跃迁
    // （若用 AND，需 2505 经验才能到门槛——远超单支线路的产出规模，会把首次跃迁拖成长跑）
    requiresAny: ['fire_preservation', 'bow_and_arrow', 'smoking_storage'],
    effects: { enableAdvance: true },
    position: { x: 0, y: 7 },
    desc: '不再跟着食物走，而是让食物长在门口。需要石器与绳索的知识，并走通任一条分支。',
  },
];

/** E2 定居时代 · 核心科技（文明之光：农业） */
const E2_TECHS_CORE: TechDef[] = [
  {
    id: 'agriculture',
    name: '农业',
    short: '农业',
    icon: '🌾',
    branch: 'core',
    era: 'E2',
    cost: 150,
    type: 'unlock',
    // AND 前置：农业不是凭空开始的——
    //   先得有「石镰与磨盘」收割野生谷物（采集时代的收割技术，收获即食物），
    //   再得有「选种育种」知道留哪些种子（种子知识）。
    // 二者都来自采集时代，农业是把它们攒到一起的那个跃迁。
    requires: ['stone_sickle', 'selective_breeding'],
    effects: {
      enableSeasons: true,
      unlockJobs: ['farmer'],
      unlockBuildings: ['field'],
    },
    position: { x: 0, y: 0 },
    desc: '定居时代的文明之光。开启季节循环——产出随春夏秋冬起伏，粮食必须在秋天攒够。',
  },
];

/**
 * 全量科技表（E1 远古时代 + E2 定居时代）。
 *
 * 数组顺序 = 核心 → 三分支 → 门槛，仅为便于阅读；UI 不依赖该顺序，
 * 但 `TOTAL_TECH_COST` 与配平脚本要求全部科技都在这里。
 * E1 部分保持原样不动：远古时代的配平基准（beeline 932s）依赖它逐字节不变。
 */
export const TECHS: TechDef[] = [
  ...E1_TECHS,
  ...E2_TECHS_CORE,
  ...E2_TECHS_FARMING,
  ...E2_TECHS_HERDING,
  ...E2_TECHS_SETTLEMENT,
];

export const TECH_MAP: Record<string, TechDef> = Object.fromEntries(
  TECHS.map(t => [t.id, t])
);

export const TECHS_BY_BRANCH: Record<TechBranch, TechDef[]> = {
  core: TECHS.filter(t => t.branch === 'core'),
  fire: TECHS.filter(t => t.branch === 'fire'),
  tool: TECHS.filter(t => t.branch === 'tool'),
  society: TECHS.filter(t => t.branch === 'society'),
  farming: TECHS.filter(t => t.branch === 'farming'),
  herding: TECHS.filter(t => t.branch === 'herding'),
  settlement: TECHS.filter(t => t.branch === 'settlement'),
  gate: TECHS.filter(t => t.branch === 'gate'),
};

/**
 * 指定时代 + 指定分支的科技。
 *
 * `core` 与 `gate` 是跨时代共用的层级名，三条发展分支则各时代不同名。
 * UI 必须走这个函数，而不是直接读 `TECHS_BY_BRANCH`——否则会把上一个时代
 * 已经研究完的科技（它们仍然 `researched === true`）一起列进当前时代。
 */
export function techsOfEraBranch(era: EraId, branch: TechBranch): TechDef[] {
  return TECHS_BY_BRANCH[branch].filter(t => t.era === era);
}

/** 指定时代实际用到的分支，按 `BRANCH_ORDER` 排序（空分支自动剔除） */
export function branchesOfEra(era: EraId): TechBranch[] {
  return BRANCH_ORDER.filter(b => TECHS_BY_BRANCH[b].some(t => t.era === era));
}

/**
 * 返回指定时代的全部科技
 * @param era 时代 id
 */
export function techsOfEra(era: EraId): TechDef[] {
  return TECHS.filter(t => t.era === era);
}

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
  // ── E2 定居时代的三条分支 ──
  farming: {
    name: '耕作与节律',
    kind: 'branch',
    order: 5,
    color: '#84cc16',
    desc: '顺应四季：春播、夏长、秋收',
    role: '分支 · 根基',
  },
  herding: {
    name: '驯养与活体储备',
    kind: 'branch',
    order: 6,
    color: '#f59e0b',
    desc: '活着的粮食——牲畜既是储备，也是畜力',
    role: '分支 · 韧性',
  },
  settlement: {
    name: '定居与储藏基建',
    kind: 'branch',
    order: 7,
    color: '#14b8a6',
    desc: '造粮仓储余粮、修房屋扩聚落',
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

/**
 * 类别全序（文明之光 → 各时代三条分支 → 时代之门）。
 *
 * 这里列全部 8 个分支；某个时代用不到的分支在其中没有科技，
 * UI 侧用 `branchesOfEra(era)` 过滤掉空分支后再渲染。
 */
export const BRANCH_ORDER: TechBranch[] = [
  'core',
  'fire',
  'tool',
  'society',
  'farming',
  'herding',
  'settlement',
  'gate',
];

/** 全部科技总成本（E1 + E2，配平校验用） */
export const TOTAL_TECH_COST = TECHS.reduce((sum, t) => sum + t.cost, 0);

/** E1 总成本——回归基准，必须恒为 2505（改动 E1 数据即视为破坏性变更） */
export const E1_TOTAL_TECH_COST = E1_TECHS.reduce((sum, t) => sum + t.cost, 0);
