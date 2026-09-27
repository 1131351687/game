// 游戏引擎（多时代）
// 只做纯计算；状态变更由 store 负责
// 数值来源：design/game/02-tech-eras.md 第 11 节 + 各时代设计文档

import { TECHS, TECH_MAP, type TechEffects } from '../data/techs';
import { JOBS, JOB_MAP, type JobId } from '../data/jobs';
import { BUILDING_MAP, UPGRADE_COST_RATIO, type BuildingId } from '../data/buildings';
import { RESOURCE_MAP, researchCurrencyName, type ResourceId } from '../data/resources';
import { ERAS, eraDistance, eraDecay, type EraId } from '../data/era';
import {
  getFoodFactorFromStorage,
  getSeasonRateMultiplier,
  getSeasonOutputMultiplier,
  getGranaryCapacity,
  getSeasonFromElapsed,
  YEAR_DURATION_SEC,
  type SeasonId,
} from './season';
import { settleTradeCycle } from './trade';
import { advancePopulation } from './systems/population';
// ── E5 远洋时代子系统（新机制集中在 game/e5/，不塞进 engine.ts）──
import {
  calcPrintChain,
  describeBottleneck,
  getBookStorage,
  getPaperStorage,
} from './e5/print';
import { tickLiteracy, getLiteracyFactor } from './e5/literacy';
import { advanceVoyage, rollVoyageEvent, ringName } from './e5/voyage';
import { getCompoundMultiplier } from './e5/compound';
import { tickBank } from './e5/bank';

// ── E6 机器时代：能量链 + 城市化（纯函数模块）──
import {
  calcFactoryOutputFromRuntime,
  calcSupply,
  applyGridThrottle,
  tickSteam,
  getPressureTier,
  getCoalDemand,
  getBoilerEta,
  getSteamEta2Effective,
  isPressureSufficient,
  emptyEnergyRuntime,
  type EnergyRuntime,
} from './e6/energy';
import {
  getUrbanizationRate,
  tickPollution,
  calcKnowledgeOutputE6,
} from './e6/urban';
import {
  FIRE,
  FIRE_TIER_INFO,
  POPULATION,
  FOOD_FACTOR,
  BUILDING_EFFECTS,
  E2,
  E3,
  E4,
  E5,
  E6,
  HUNT,
  getFireTier,
  getToolMultiplier,
  type FireTier,
} from '../data/constants';

// ─────────────────────────────────────────────
// 状态形状（引擎只读）
// ─────────────────────────────────────────────
export interface EraState {
  /** 当前所处时代 */
  era: EraId;
  food: number;
  wood: number;
  stone: number;
  experience: number;
  /** 人口：**始终为整数**（小数增长累积在 populationProgress 里） */
  population: number;
  /** 人口增长的累积进度（0..1）；满 1 时人口 +1 */
  populationProgress: number;
  fire: number;
  jobs: Record<string, number>;
  buildings: Record<string, number>;
  techs: Record<string, boolean>;
  autoMaintainFire: boolean;

  // ─────────────────────────────────────────────
  // E2 定居时代
  // ─────────────────────────────────────────────

  // 注：谷物（grain）曾是与食物并列的主粮资源，2026-09-12 用户拍板
  // 「暂时不区分采集所得与农耕收获」，两资源已**合并为单一「食物」**。
  // 粮仓体系（容量 / 陶窑加成 / 通风）保留，作用对象改为食物上限。
  /** 活体牲畜：既是储备也是畜力，**不占储存容量** */
  livestock: number;
  /** 织物 */
  fabric: number;
  /**
   * 本时代已经过的秒数。
   *
   * 这是季节循环的**唯一驱动源**：季节完全由它推导（`getSeasonFromElapsed`），
   * 不另存「当前季节」字段——两个字段迟早会互相矛盾。
   * 跨时代跃迁时归零，所以每个时代都从春天开始。
   */
  eraElapsedSec: number;

  // ─────────────────────────────────────────────
  // E3 城邦时代（核心科技：楔形文字）
  //
  // ⚠️ 研究货币：用户拍板「改名即可」——E3 继续使用 experience 字段，
  //    显示名变为「知识」（researchCurrencyName），产出通道改为书吏。
  //    不新增独立 knowledge 字段。
  // ─────────────────────────────────────────────

  /** 铜：青铜原料之一；仅本地矿藏为铜矿时可采 */
  copper: number;
  /** 锡：普通地形只能贸易进口；锡矿带可少量本地开采 */
  tin: number;
  /** 青铜：冶炼工以铜+锡炼出 */
  bronze: number;
  /** 青金石：远方贸易品（需「青金石商路」解锁） */
  lapis: number;
  /** 铁：E4 铁器与帝国建设材料 */
  iron: number;
  /** 铸币：E4 军团和扩张的支付媒介 */
  coin: number;
  /** 版图格数：E4 扩张规模，至少为 1 */
  territory: number;
  /** 军团数量：E4 征伐与驻防的唯一兵力池 */
  legions: number;
  /** 版图扩张平定状态 */
  expansionPending: { until: number; targetN: number } | null;
  /** P1 文明重启是否解锁 */
  p1Unlocked: boolean;
  /** 遗产点 */
  legacyPoints: number;

  /** 已刻录科技 id（槽位占用 = recorded.length；刻录不可撤销） */
  recorded: string[];
  /** 历史上刻录过的科技 id（供档案库加成计数，与技术退役解耦） */
  recordedOnce: string[];

  /** 已建立的贸易路线 */
  tradeRoutes: TradeRoute[];
  /** 声望 0–100，初始 50 */
  reputation: number;

  // ── E5 远洋时代 ──
  // 印刷链：木材 →(造纸工)→ 纸张 →(印刷工)→ 典籍 →(学者)→ 研究点
  /** 纸张：造纸链中间品 */
  paper: number;
  /** 典籍：印刷工产出、学者消耗（消耗品，库存下降是设计） */
  books: number;
  /** 白银：远航带回，印书坊与大学的成本项 */
  silver: number;
  /** 研究点：E5 起的研究货币（与 experience「知识」并存不换算） */
  researchPoints: number;
  /** 异域物产：只增不减，用于兑换永久加成 */
  exoticGoods: number;
  /** 识字率 0–100：**状态值，不是资源** */
  literacy: number;
  /** 进行中的远航船队 */
  voyages: Voyage[];
  /** 当前未还贷款（白银） */
  loan: number;

  // ── E6 机器时代 ──
  //
  // 能量链：煤 →(司炉工)→ 热 →(蒸汽机 η₂)→ 机械能 →(发电机 η₃ → 输电 η₄)→ 电 →(电动机 η₅)→ 工厂
  // 每加一环就多一次 η 乘法打折 —— 这是本代的核心矛盾，也是玩家的优化对象。
  /** 煤：能量链起点，也是炼钢的还原剂（两个需求互相争夺 → 煤荒） */
  coal: number;
  /** 钢：炼钢工耗煤产出；工业设施与铁路的结构件 */
  steel: number;
  /** 电：发电厂由机械能转换；驱动工厂（替代直驱） */
  electricity: number;
  /** 工业品：工厂产出（耗机械能）；进而不入主资源条，属"产能"读数 */
  industrial: number;
  /**
   * 蒸汽压力 0–100：本代的视觉主角（地位＝E1 火种）。
   *
   * ⚠️ 它是**积分态**（司炉工维持上升、自然衰减下降），因此必须存档。
   *    派生值（如 η、供给率、ρ）不存档，每 tick 重算。
   */
  steamPressure: number;
  /** 污染值：人口增长的「环境代价」载体，经卫生因子反噬 r */
  pollution: number;
  /**
   * 城市化率 0–1：U = min(1, 工人住宅承载 / max(population,1))。
   *
   * 按 devplan §3.1 的说明，它虽是派生量但**存为字段**：它是拥挤系数与
   * 「人口卡住诊断」的共同输入，存下来可避免每 tick 重算时与历史值抖动。
   * 定义公式的单一来源是 urban.getUrbanizationRate，禁止在别处另行推导。
   */
  urbanizationRate: number;
  /** 铁路工程等级 0–3（可升级工程系统，非点状建筑） */
  railroadLevel: number;
}

/**
 * 一支远航船队。
 *
 * E5 的远航是**三环**结构（近海 / 远洋 / 环球），每环有各自的
 * 时长、物料与船员要求；progress 到 target 即结算一次事件。
 * 定义见 design/game/eras/E5-maritime.md §11.6。
 */
export interface Voyage {
  /** 环数：1 近海 / 2 远洋 / 3 环球 */
  ring: 1 | 2 | 3;
  /** 已推进进度 */
  progress: number;
  /** 完成所需进度（= 环时长 × 水手速率基准） */
  target: number;
  /** 该船队占用的水手数 */
  sailors: number;
  /** 是否已触发「发现新大陆」里程碑（第 2 环首次完成时置位，全局只触发一次） */
  newWorldFound: boolean;
}

/**
 * 一条贸易路线（虚拟邻邦）。
 * 数据定义见 game/trade.ts（固定 5 个邻邦）。
 */
export interface TradeRoute {
  /** 邻邦 id */
  partnerId: string;
  /** 我方支付的货物 */
  demand: ResourceId;
  /** 我方换得的货物 */
  supply: ResourceId;
  /** 距离（1/2/3），距离系数 = 1 + 0.15 × 距离 */
  distance: 1 | 2 | 3;
  /** 运输方式；旧存档缺失时由邻邦数据迁移补齐 */
  transport?: 'land' | 'water';
  /** 最近一次结算状态，用于贸易面板反馈 */
  lastStatus?: 'ok' | 'break' | 'refused' | 'blocked';
  /** 商队周期计时（30 秒一轮） */
  cycleAccum: number;
  /** 近 5 周期价格（供迷你折线图与需求冲击计算） */
  priceHistory: number[];
  /** 契约锁价截止时间戳（秒，绝对时间） */
  contractUntil?: number;
  breachPenaltyUntil?: number;
}

/** @deprecated 旧名单时代命名，仅为向后兼容保留。新代码请用 EraState */
export type E1State = EraState;

// ─────────────────────────────────────────────
// 科技效果聚合
// ─────────────────────────────────────────────
export interface AggregatedEffects {
  fireEnabled: boolean;
  activeFireRestore: boolean;
  fireDecayMultiplier: number;
  fireMaxBonus: number;
  removeWeakFoodPenalty: boolean;
  foodMultiplier: number;
  stoneMultiplier: number;
  expMultiplier: number;
  gathererMultiplier: number;
  toolTier: number;
  buildingCostMultiplier: number;
  stabilityBonus: number;
  huntPartyThreshold: number;
  huntPartyBonus: number;
  foodStorageMultiplier: number;
  enableAdvance: boolean;

  // ─────────────────────────────────────────────
  // E2 定居时代（核心科技：农业）
  // ─────────────────────────────────────────────

  /** 季节循环是否开启（农业核心科技） */
  seasonsEnabled: boolean;
  /** 四季农业倍率加成（加法，叠加在季节基础值之上） */
  seasonAgriBonus: Record<SeasonId, number>;
  /** 谷物总产出乘数 */
  grainMultiplier: number;
  /** 按岗位的效率乘数 */
  jobMultiplier: Partial<Record<JobId, number>>;
  /** 按资源的产出乘数 */
  resourceMultiplier: Partial<Record<ResourceId, number>>;

  /** 牲畜产食物乘数 */
  livestockFoodMul: number;
  /** 夏季牧人效率乘数 */
  summerHerderMul: number;
  /** 每座畜栏存栏上限加成 */
  penCapacityAdd: number;
  /** 牲畜世代等级（取最大） */
  livestockTier: number;
  /** 饥荒时牲畜存活率（0=全死，0.5=活一半；取最大） */
  livestockFamineSurvival: number;

  /** 田地出产乘数 */
  fieldYieldMul: number;
  /** 田地效率上限（取最大） */
  fieldEfficiencyCap: number;
  /** 饲料成本乘数（<1 降低） */
  feedCostMultiplier: number;

  /** 村落民居成本乘数 */
  villageHouseCostMul: number;
  /** 单座粮仓容量（取最大） */
  granaryPerUnit: number;
  /** 粮仓总容量乘数 */
  granaryCapacityMul: number;
  /** 陶窑容量加成（取最大） */
  kilnBonus: number;
  /** 粮仓溢出阈值加成 */
  granaryOverflowBonus: number;
  /** 岗位切换成本乘数（<1 降低） */
  jobSwitchCostMul: number;
  /** 取消 E1 承载力硬顶 */
  removeCapacityCap: boolean;

  // ─────────────────────────────────────────────
  // E3 城邦时代（核心科技：楔形文字）
  // ─────────────────────────────────────────────

  /** 记录/刻录系统是否开启 */
  recordingEnabled: boolean;
  /** 记录容量加成（加法键：泥板制作 +2） */
  recordCapacityAdd: number;
  /** 书吏产出乘数 */
  scribeOutputMul: number;
  /** 矿工追加铜产出速率（加法键：铜矿开采 0.06/人/秒） */
  minerCopperRate: number;
  /** 矿工追加锡产出速率（加法键：锡矿开采 0.03/人/秒） */
  minerTinRate: number;
  /** 矿工采掘产出乘数（深井采矿 1.5） */
  minerOutputMul: number;
  /** 档案库加成：每项已刻录科技的产出加成（取最大，0.03 → 扩建 0.04） */
  archiveBonus: number;

  /** 每条路线所需书吏（绝对设置：40 → 账目分类 30） */
  scribesPerRoute: number;
  /** 路线槽位加成（商栈 +2/座 计入独立公式） */
  routeSlotsAdd: number;
  /** 换算损耗（未研究度量衡 0.15；度量衡 → 0；取最小） */
  conversionLoss: number;
  /** 契约违约惩罚倍率（印章封泥 0.5） */
  contractBreachPenalty: number;
  /** 契约时长倍率（契约刻录 ×2.4） */
  contractDurationMul: number;
  /** 可同时锁定契约的路线数（取最大） */
  contractSlots: number;
  /** 陆路运力乘数（轮子 1.4 / 驴队 1.3 叠加） */
  landCaravanMul: number;
  /** 水路距离系数乘数（河运帆船 0.6） */
  waterDistMul: number;
  /** 路线中断概率加成（<0 降低） */
  routeBreakChance: number;
  /** 是否解锁青金石货类 */
  lapisEnabled: boolean;

  /** 青铜回收率（再生冶炼 0.3） */
  recyclingRate: number;
  /** 文明级损失事件减幅（青铜兵器 0.4） */
  lossReduction: number;
  ironOutputMul: number;
  coinOutputMul: number;
  roadLevelMax: number;
  governanceMul: number;
  legionPowerMul: number;
  expansionCostMul: number;
  territoryOutputMul: number;
  legionPayMul: number;
  expansionFlatMul: number;
  territoryCapacityMul: number;

  // ── E5 远洋时代 ──
  /** 复利系数 k 的加项总和（加法键）：印刷术 0.05 + 活字/大学/印坊分工/科学方法 */
  compoundKAdd: number;
  /** 典籍存储加成（加法键；图书馆是另一条来源） */
  bookCapacityAdd: number;
  /** 识字率上限加成（加法键；大学是另一条来源） */
  literacyCapAdd: number;
  /** 远航进度加成（加法键） */
  voyageBonus: number;
  /** 远航系统是否解锁（指南针） */
  voyageEnabled: boolean;
  /** 银行与信贷是否解锁 */
  bankEnabled: boolean;
  // E5 印刷链产出乘数
  paperOutputMul: number;
  printOutputMul: number;
  researchOutputMul: number;

  // ── E6 机器时代 ──
  //
  // ⚠️ 本代的键全部围绕能量链的 η 乘法。刻意**不给"总效率 +X%"这种笼统键** ——
  //    那会让能量链面板失去"损耗在哪一环"的诊断能力，而逐环可观测正是本代设计意图。
  /** 能量链系统是否解锁（蒸汽机(工业应用)） */
  energyEnabled: boolean;
  /** 电网 ρ 是否解锁（电磁感应·发电机） */
  gridEnabled: boolean;
  /** 铁路工程是否解锁 */
  railroadEnabled: boolean;
  /** η₁ 锅炉热效率加成（加法键；焦炭冶炼 +0.045） */
  boilerEtaAdd: number;
  /** η₂ 蒸汽世代内部乘数（调速器/复式/表面冷凝） */
  steamGenMul: number;
  /** 工厂规模效应斜率加成（加法键；回转式/复式/标准化/流水线） */
  scaleSlopeAdd: number;
  /** 工厂产出乘数（流水线 1.15） */
  factoryOutMul: number;
  /** 污染累积减免（加法键，上限 1.0） */
  pollutionReduce: number;
  /** 拥挤系数缓解（加法键；城市排水系统） */
  crowdingReduce: number;
  /** 铁路工程收益乘数（钢轨 1.25） */
  railroadBonusMul: number;
  /** 每人知识产出加成（分析机彩蛋 +0.05） */
  knowledgePerPopAdd: number;
}

const DEFAULT_EFFECTS: AggregatedEffects = {
  fireEnabled: false,
  activeFireRestore: false,
  fireDecayMultiplier: 1,
  fireMaxBonus: 0,
  removeWeakFoodPenalty: false,
  foodMultiplier: 1,
  stoneMultiplier: 1,
  expMultiplier: 1,
  gathererMultiplier: 1,
  toolTier: 0,
  buildingCostMultiplier: 1,
  stabilityBonus: 0,
  huntPartyThreshold: 0,
  huntPartyBonus: 0,
  foodStorageMultiplier: 1,
  enableAdvance: false,

  // ── E2 定居时代 ──
  seasonsEnabled: false,
  seasonAgriBonus: { spring: 0, summer: 0, autumn: 0, winter: 0 },
  grainMultiplier: 1,
  jobMultiplier: {},
  resourceMultiplier: {},
  livestockFoodMul: 1,
  summerHerderMul: 1,
  penCapacityAdd: 0,
  livestockTier: 0,
  livestockFamineSurvival: 0,
  fieldYieldMul: 1,
  fieldEfficiencyCap: 1,
  feedCostMultiplier: 1,
  villageHouseCostMul: 1,
  granaryPerUnit: 0,
  granaryCapacityMul: 1,
  kilnBonus: 0,
  granaryOverflowBonus: 0,
  jobSwitchCostMul: 1,
  removeCapacityCap: false,

  // ── E3 城邦时代 ──
  recordingEnabled: false,
  recordCapacityAdd: 0,
  scribeOutputMul: 1,
  minerCopperRate: 0,
  minerTinRate: 0,
  minerOutputMul: 1,
  archiveBonus: 0,
  scribesPerRoute: 40,
  routeSlotsAdd: 0,
  conversionLoss: 0.15,
  contractBreachPenalty: 1,
  contractDurationMul: 1,
  contractSlots: 1,
  landCaravanMul: 1,
  waterDistMul: 1,
  routeBreakChance: 0,
  lapisEnabled: false,
  recyclingRate: 0,
  lossReduction: 0,
  ironOutputMul: 1,
  coinOutputMul: 1,
  roadLevelMax: 4,
  governanceMul: 1,
  legionPowerMul: 1,
  expansionCostMul: 1,
  territoryOutputMul: 1,
  legionPayMul: 1,
  expansionFlatMul: 1,
  territoryCapacityMul: 1,

  // ── E5 远洋时代 ──
  compoundKAdd: 0,
  bookCapacityAdd: 0,
  literacyCapAdd: 0,
  voyageBonus: 0,
  voyageEnabled: false,
  bankEnabled: false,
  paperOutputMul: 1,
  printOutputMul: 1,
  researchOutputMul: 1,

  // ── E6 机器时代 ──
  energyEnabled: false,
  gridEnabled: false,
  railroadEnabled: false,
  boilerEtaAdd: 0,
  steamGenMul: 1,
  scaleSlopeAdd: 0,
  factoryOutMul: 1,
  pollutionReduce: 0,
  crowdingReduce: 0,
  railroadBonusMul: 1,
  knowledgePerPopAdd: 0,
};

export function aggregateEffects(state: E1State): AggregatedEffects {
  // 注意：seasonAgriBonus / jobMultiplier / resourceMultiplier 是引用类型，
  // 必须新建。若沿用浅拷贝，写入会穿透到 DEFAULT_EFFECTS 上，
  // 污染此后所有调用（E1 的配平会被悄悄改掉）。
  const acc: AggregatedEffects = {
    ...DEFAULT_EFFECTS,
    seasonAgriBonus: { ...DEFAULT_EFFECTS.seasonAgriBonus },
    jobMultiplier: {},
    resourceMultiplier: {},
  };

  // ── E3 刻录口径预扫描（修复顺序依赖 bug）──
  //
  // 记录系统是否开启（只要任一已研究科技带 enableRecording，当前即「楔形文字」）。
  // 必须在循环**之前**确定，否则 acc.recordingEnabled 是在循环内被楔形文字置位的，
  // 导致遍历到 cuneiform 之前的科技不受口头 ×0.5 惩罚、之后的全罚——
  // 口头乘数取决于科技在 TECHS 数组里的顺序（顺序依赖 bug）。
  // 预扫描后用 recordingOn 判定，与遍历顺序彻底解耦。
  let recordingOn = false;
  for (const t of TECHS) {
    if (state.techs[t.id] && t.effects.enableRecording) {
      recordingOn = true;
      break;
    }
  }

  for (const tech of TECHS) {
    if (!state.techs[tech.id]) continue;
    const e: TechEffects = tech.effects;

    // ── 时代衰减 ──
    //
    // 设计规则：旧时代的核心科技「不废弃，只降权」
    //   主引擎期 ×1.00 → 地基期 ×0.60 → ×0.36 → ×0.22 → 下限 ×0.20
    //
    // 关键区分（这是设计文档里"旧核心提供质的加成，不只是量"的落地）：
    //   · 数值型效果（乘数/加成）→ 按 decay 衰减
    //   · 布尔/解锁型效果（enableFire / unlockJobs / setToolTier）→ 不衰减
    //     因为「已掌握的东西不会忘记」
    const k = eraDecay(eraDistance(tech.era, state.era));
    /** 乘数衰减：把 m 朝基线 1 拉近。m=1.25、k=0.6 → 1.15 */
    const mul = (m: number): number => 1 + (m - 1) * k;
    /** 加数衰减：把 v 朝基线 0 拉近 */
    const add = (v: number): number => v * k;

    // ── E3 刻录口径：口头 ×50% / 已刻录 ×100% ──
    //
    // 记录系统开启后（E3 研究「楔形文字」），**未刻录**的科技效果打对折——
    // 知识靠口耳相传会衰减，刻上泥板才是"文明的确定沉淀"。
    // 只对**数值型**效果生效；解锁/布尔型不衰减（"已掌握的东西不会忘记"）。
    //
    // ⚠️ 时代门控：E1/E2 没有记录系统（recorded 恒空、recordingEnabled=false），
    // 此处必须零影响，否则 E1/E2 基线（1163s/1920s）会被整体腰斩。
    // recordingOn 由循环前预扫描得出（见上方），与遍历顺序无关，修复顺序依赖 bug。
    // E3 的口头/刻录机制只约束 E3 科技。进入 E4 后制度与工程科技
    // 由新的治理体系承载，不应因为没有 E3 的泥板记录而再次减半。
    const isOral = recordingOn && tech.era === 'E3' && !state.recorded.includes(tech.id);
    const oralMul = isOral ? 0.5 : 1;
    /** 乘数衰减 × 刻录口径：口头再 ×0.5 */
    const mulR = (m: number): number => mul(m) * oralMul;
    /** 加数衰减 × 刻录口径 */
    const addR = (v: number): number => add(v) * oralMul;

    // — 解锁/布尔型：不衰减 —
    if (e.enableFire) acc.fireEnabled = true;
    if (e.activeFireRestore) acc.activeFireRestore = true;
    if (e.removeWeakFoodPenalty) acc.removeWeakFoodPenalty = true;
    if (e.setToolTier !== undefined) acc.toolTier = Math.max(acc.toolTier, e.setToolTier);
    if (e.huntPartyThreshold) acc.huntPartyThreshold = e.huntPartyThreshold;
    if (e.enableAdvance) acc.enableAdvance = true;

    // — 数值型：按时代衰减 —
    if (e.fireDecayMultiplier !== undefined) acc.fireDecayMultiplier *= mulR(e.fireDecayMultiplier);
    if (e.fireMaxBonus) acc.fireMaxBonus += addR(e.fireMaxBonus);
    if (e.foodMultiplier) acc.foodMultiplier *= mulR(e.foodMultiplier);
    if (e.stoneMultiplier) acc.stoneMultiplier *= mulR(e.stoneMultiplier);
    if (e.expMultiplier) acc.expMultiplier *= mulR(e.expMultiplier);
    if (e.gathererMultiplier) acc.gathererMultiplier *= mulR(e.gathererMultiplier);
    if (e.buildingCostMultiplier) acc.buildingCostMultiplier *= mulR(e.buildingCostMultiplier);
    if (e.stabilityBonus) acc.stabilityBonus += addR(e.stabilityBonus);
    if (e.huntPartyBonus) acc.huntPartyBonus = addR(e.huntPartyBonus);
    if (e.foodStorageMultiplier) acc.foodStorageMultiplier *= mulR(e.foodStorageMultiplier);

    // — E2 布尔/解锁型：不衰减 —
    if (e.enableSeasons) acc.seasonsEnabled = true;
    if (e.removeCapacityCap) acc.removeCapacityCap = true;

    // — E2 绝对设置型：取「已研究科技中的最大值」，不衰减 —
    //
    // 这些是能力上限而非产量加成：地基期也不该退回石器时代的水准。
    if (e.fieldEfficiencyCap !== undefined) {
      acc.fieldEfficiencyCap = Math.max(acc.fieldEfficiencyCap, e.fieldEfficiencyCap);
    }
    if (e.livestockTier !== undefined) {
      acc.livestockTier = Math.max(acc.livestockTier, e.livestockTier);
    }
    if (e.granaryPerUnit !== undefined) {
      acc.granaryPerUnit = Math.max(acc.granaryPerUnit, e.granaryPerUnit);
    }
    if (e.kilnBonus !== undefined) {
      acc.kilnBonus = Math.max(acc.kilnBonus, e.kilnBonus);
    }
    if (e.livestockFamineSurvival !== undefined) {
      acc.livestockFamineSurvival = Math.max(
        acc.livestockFamineSurvival,
        e.livestockFamineSurvival
      );
    }

    // — E2 季节倍率加成：加法键，按时代衰减 —
    if (e.springAgriMul) acc.seasonAgriBonus.spring += addR(e.springAgriMul);
    if (e.summerAgriMul) acc.seasonAgriBonus.summer += addR(e.summerAgriMul);
    if (e.autumnAgriMul) acc.seasonAgriBonus.autumn += addR(e.autumnAgriMul);
    if (e.winterAgriMul) acc.seasonAgriBonus.winter += addR(e.winterAgriMul);

    // — E2 乘法键：按时代衰减 —
    if (e.grainMultiplier) acc.grainMultiplier *= mulR(e.grainMultiplier);
    if (e.livestockFoodMul) acc.livestockFoodMul *= mulR(e.livestockFoodMul);
    if (e.summerHerderMul) acc.summerHerderMul *= mulR(e.summerHerderMul);
    if (e.fieldYieldMul) acc.fieldYieldMul *= mulR(e.fieldYieldMul);
    if (e.feedCostMultiplier) acc.feedCostMultiplier *= mulR(e.feedCostMultiplier);
    if (e.villageHouseCostMul) acc.villageHouseCostMul *= mulR(e.villageHouseCostMul);
    if (e.granaryCapacityMul) acc.granaryCapacityMul *= mulR(e.granaryCapacityMul);
    if (e.jobSwitchCostMul) acc.jobSwitchCostMul *= mulR(e.jobSwitchCostMul);

    // — E2 加法键：按时代衰减 —
    if (e.penCapacityAdd) acc.penCapacityAdd += addR(e.penCapacityAdd);
    if (e.granaryOverflowBonus) acc.granaryOverflowBonus += addR(e.granaryOverflowBonus);

    // — E2 按岗位 / 按资源的乘数 —
    if (e.jobMultiplier) {
      for (const [job, m] of Object.entries(e.jobMultiplier)) {
        if (m === undefined) continue;
        const id = job as JobId;
        acc.jobMultiplier[id] = (acc.jobMultiplier[id] ?? 1) * mulR(m);
      }
    }
    if (e.resourceMultiplier) {
      for (const [res, m] of Object.entries(e.resourceMultiplier)) {
        if (m === undefined) continue;
        const id = res as ResourceId;
        acc.resourceMultiplier[id] = (acc.resourceMultiplier[id] ?? 1) * mulR(m);
      }
    }

    // ── E3 布尔/解锁型：不衰减 ──
    if (e.enableRecording) acc.recordingEnabled = true;
    if (e.enableLapis) acc.lapisEnabled = true;

    // ── E3 乘法键：按时代衰减 ──
    if (e.scribeOutputMul) acc.scribeOutputMul *= mulR(e.scribeOutputMul);
    if (e.minerOutputMul) acc.minerOutputMul *= mulR(e.minerOutputMul);
    if (e.contractBreachPenalty) acc.contractBreachPenalty *= mulR(e.contractBreachPenalty);
    if (e.contractDurationMul) acc.contractDurationMul *= mulR(e.contractDurationMul);
    if (e.landCaravanMul) acc.landCaravanMul *= mulR(e.landCaravanMul);
    if (e.waterDistMul) acc.waterDistMul *= mulR(e.waterDistMul);

    // ── E3 加法键：按时代衰减 ──
    if (e.recordCapacityAdd) acc.recordCapacityAdd += addR(e.recordCapacityAdd);
    if (e.minerCopperRate) acc.minerCopperRate += addR(e.minerCopperRate);
    if (e.minerTinRate) acc.minerTinRate += addR(e.minerTinRate);
    if (e.routeSlotsAdd) acc.routeSlotsAdd += addR(e.routeSlotsAdd);
    if (e.routeBreakChance) acc.routeBreakChance += addR(e.routeBreakChance);

    // ── E3 绝对设置型：取最大 / 最小，不衰减 ──
    //   能力上限（档案加成 / 契约槽 / 回收率）取最大；
    //   换算损耗是"缺陷消除"，取最小（度量衡把它压到 0）。
    if (e.archiveBonus !== undefined) acc.archiveBonus = Math.max(acc.archiveBonus, e.archiveBonus);
    if (e.scribesPerRoute !== undefined) {
      acc.scribesPerRoute = Math.min(acc.scribesPerRoute, e.scribesPerRoute);
    }
    if (e.contractSlots !== undefined) {
      acc.contractSlots = Math.max(acc.contractSlots, e.contractSlots);
    }
    if (e.recyclingRate !== undefined) {
      acc.recyclingRate = Math.max(acc.recyclingRate, e.recyclingRate);
    }
    if (e.lossReduction !== undefined) {
      acc.lossReduction = Math.max(acc.lossReduction, e.lossReduction);
    }
    if (e.ironOutputMul) acc.ironOutputMul *= mulR(e.ironOutputMul);
    if (e.coinOutputMul) acc.coinOutputMul *= mulR(e.coinOutputMul);
    if (e.roadLevelMax !== undefined) acc.roadLevelMax = Math.max(acc.roadLevelMax, e.roadLevelMax);
    if (e.governanceMul) acc.governanceMul *= mulR(e.governanceMul);
    if (e.legionPowerMul) acc.legionPowerMul *= mulR(e.legionPowerMul);
    if (e.expansionCostMul) acc.expansionCostMul *= mulR(e.expansionCostMul);
    if (e.territoryOutputMul) acc.territoryOutputMul *= mulR(e.territoryOutputMul);
    if (e.legionPayMul) acc.legionPayMul *= mulR(e.legionPayMul);
    if (e.expansionFlatMul) acc.expansionFlatMul *= mulR(e.expansionFlatMul);
    if (e.territoryCapacityMul) acc.territoryCapacityMul *= mulR(e.territoryCapacityMul);
    if (e.conversionLoss !== undefined) {
      acc.conversionLoss = Math.min(acc.conversionLoss, e.conversionLoss);
    }

    // ── E5 远洋时代 ──
    //
    // 复利系数 k 的加项走**加法键**并吃时代衰减：跨代之后旧加成按 eraDecay
    // 被拉向 0，但 N（本时代已解锁科技数）会被归零，两套机制不冲突。
    //
    // ⚠️ 这里只聚合 k 的**加项**，绝不在引擎里缓存 R 本身。
    //    R = 1 + k × N_eff 必须在每个 tick 由 game/e5/compound.ts 现算，
    //    否则「刚研究完一项科技，下一 tick 研究速度立刻变大」不成立。
    if (e.compoundKAdd) acc.compoundKAdd += addR(e.compoundKAdd);
    if (e.bookCapacityAdd) acc.bookCapacityAdd += addR(e.bookCapacityAdd);
    if (e.literacyCapAdd) acc.literacyCapAdd += addR(e.literacyCapAdd);
    if (e.voyageBonus) acc.voyageBonus += addR(e.voyageBonus);
    if (e.enableVoyage) acc.voyageEnabled = true;
    if (e.enableBank) acc.bankEnabled = true;
    if (e.paperOutputMul) acc.paperOutputMul *= mulR(e.paperOutputMul);
    if (e.printOutputMul) acc.printOutputMul *= mulR(e.printOutputMul);
    if (e.researchOutputMul) acc.researchOutputMul *= mulR(e.researchOutputMul);

    // ── E6 机器时代 ──
    //
    // 解锁型（不衰减）：时代机制的开关，跨代后机制本身仍在（石油机仍可转），
    // 只是效率按 eraDecay 降权 —— 与 E5 的 enableVoyage/enableBank 同处理。
    if (e.enableEnergyChain) acc.energyEnabled = true;
    if (e.enableGrid) acc.gridEnabled = true;
    if (e.enableRailroad) acc.railroadEnabled = true;

    // 衰减键：
    //   boilerEtaAdd / scaleSlopeAdd 是加法键 → addR
    //   其余乘数键 → mulR
    //
    // ⚠️ steamGenTier / transmitTier 这两个"绝对档位"键**不在这里聚合**。
    //    它们是"取已研究科技中的最高档"，由 energy.ts 直接查 state.techs 决定
    //    （getSteamEta2 / getTransmitEta4）。若在这里聚合成一个标量，
    //    跨代衰减会把"世代 IV"降解成一个无意义的中间值，
    //    而档位在语义上只有 I/I5/III/IV 四档，不存在"III.4"。
    if (e.boilerEtaAdd) acc.boilerEtaAdd += addR(e.boilerEtaAdd);
    if (e.scaleSlopeAdd) acc.scaleSlopeAdd += addR(e.scaleSlopeAdd);
    if (e.pollutionReduce) acc.pollutionReduce += addR(e.pollutionReduce);
    if (e.crowdingReduce) acc.crowdingReduce += addR(e.crowdingReduce);
    if (e.knowledgePerPopAdd) acc.knowledgePerPopAdd += addR(e.knowledgePerPopAdd);
    if (e.steamGenMul) acc.steamGenMul *= mulR(e.steamGenMul);
    if (e.factoryOutMul) acc.factoryOutMul *= mulR(e.factoryOutMul);
    if (e.railroadBonusMul) acc.railroadBonusMul *= mulR(e.railroadBonusMul);
  }

  return acc;
}

// ─────────────────────────────────────────────
// T2.1 火种系统
// ─────────────────────────────────────────────

export function getFireMax(state: E1State): number {
  const eff = aggregateEffects(state);
  const hearths = state.buildings.hearth ?? 0;
  return FIRE.MAX + eff.fireMaxBonus + hearths * BUILDING_EFFECTS.HEARTH_MAX_BONUS;
}

export function getFireDecay(state: E1State): number {
  // 定居时代（E2 起）：火源转为恒定，不再衰减也不再需要维护。
  // tickFire 早已对非 E1 提前返回（火值冻结），若这里仍返回非零值，
  // UI 会显示一个「N 秒后熄灭」的假倒计时 —— 引擎与视图必须同源。
  if (state.era !== 'E1') return 0;

  const eff = aggregateEffects(state);
  const hearths = state.buildings.hearth ?? 0;
  let decay = FIRE.DECAY_PER_SEC * eff.fireDecayMultiplier;
  for (let i = 0; i < hearths; i++) {
    decay *= 1 - BUILDING_EFFECTS.HEARTH_DECAY_REDUCTION;
  }
  return decay;
}

/** 推进火种 dt 秒（含自动维持消耗木材） */
export function tickFire(
  state: E1State,
  dt: number
): { fire: number; wood: number; maintained: boolean } {
  let fire = state.fire;
  let wood = state.wood;
  let maintained = false;

  if (!aggregateEffects(state).fireEnabled) {
    return { fire: 0, wood, maintained: false };
  }

  // E2 起：火种维护取消（定居后有固定炉灶），火值冻结不再衰减
  // —— 设计文档：进入新时代时旧核心「不废弃，只降权」
  //    维护压力解除，但它的加成仍按时代衰减继续生效（见 getFireFoodBonus）
  if (state.era !== 'E1') {
    return { fire, wood, maintained: false };
  }

  if (state.autoMaintainFire && fire < FIRE.AUTO_MAINTAIN_THRESHOLD && wood >= 1) {
    const need = Math.ceil((FIRE.AUTO_MAINTAIN_THRESHOLD - fire) / FIRE.PER_WOOD);
    const use = Math.min(need, Math.floor(wood));
    if (use > 0) {
      wood -= use;
      fire = Math.min(fire + use * FIRE.PER_WOOD, getFireMax(state));
      maintained = true;
    }
  }

  fire = Math.max(0, fire - getFireDecay(state) * dt);
  return { fire, wood, maintained };
}

/** 手动投入木材 */
export function addFuel(state: E1State, woodAmount: number): { fire: number; wood: number } {
  const use = Math.min(woodAmount, Math.floor(state.wood));
  const fire = Math.min(state.fire + use * FIRE.PER_WOOD, getFireMax(state));
  return { fire, wood: state.wood - use };
}

export function getFireFactor(state: E1State): number {
  return FIRE_TIER_INFO[getFireTier(state.fire)].factor;
}

export function getFireTierInfo(state: E1State): {
  tier: FireTier;
  name: string;
  factor: number;
  color: string;
} {
  const tier = getFireTier(state.fire);
  const info = FIRE_TIER_INFO[tier];
  return { tier, name: info.name, factor: info.factor, color: info.color };
}

/** 火种带来的食物加成（热石煮食可取消微弱档惩罚） */
export function getFireFoodBonus(state: E1State): number {
  const tier = getFireTier(state.fire);
  const eff = aggregateEffects(state);

  const raw =
    tier === 'weak' && eff.removeWeakFoodPenalty
      ? FIRE_TIER_INFO.stable.foodBonus
      : FIRE_TIER_INFO[tier].foodBonus;

  // 火种属 E1 的核心科技：进入后续时代后加成按时代距离衰减
  // （E1 内 d=0 系数 1.0，不影响现有手感）
  const k = eraDecay(eraDistance('E1', state.era));
  return raw * k;
}

// ─────────────────────────────────────────────
// T2.2 人口模型（逻辑斯蒂增长）
// ─────────────────────────────────────────────

export function getCapacity(state: E1State): number {
  const houses = state.buildings.house ?? 0;
  const villageHouses = state.buildings.village_house ?? 0;
  const fields = state.buildings.field ?? 0;
  const farmers = state.jobs.farmer ?? 0;

  if (state.era === 'E4') {
    const existingHousing =
      houses * POPULATION.CAPACITY_PER_HOUSE +
      villageHouses * E2.CAPACITY_PER_VILLAGE_HOUSE +
      (state.buildings.city_house ?? 0) * E3.POP_PER_CITY_HOUSE +
      Math.min(fields, Math.floor(farmers / E2.FIELD_MIN_FARMERS)) * E2.CAPACITY_PER_FIELD;
    return E3.POP_BASE_CAPACITY + existingHousing + getTerritoryCapacity(state);
  }

  // ── E3 城邦时代：人口模型切换 ──
  // K = 320 基础 + 民居×130（E3-citystate.md §11.3）。
  // 旧时代住所/田地在此之上继续叠加——跃迁不重置，K 必须连续。
  if (state.era === 'E3') {
    const cityHouses = state.buildings.city_house ?? 0;
    return (
      E3.POP_BASE_CAPACITY +
      cityHouses * E3.POP_PER_CITY_HOUSE +
      houses * POPULATION.CAPACITY_PER_HOUSE +
      villageHouses * E2.CAPACITY_PER_VILLAGE_HOUSE +
      Math.min(fields, Math.floor(farmers / E2.FIELD_MIN_FARMERS)) * E2.CAPACITY_PER_FIELD
    );
  }

  // ── E5 远洋时代：人口模型切换（E5-maritime.md §11.4）──
  //
  // K = E5 基础 300 + 住所×60 + 新作物(马铃薯)×150 + 旧时代全部遗产
  //
  // ⚠️ 曾经漏掉这个分支，导致 E5 落回 E1/E2 的**默认公式**——
  //    默认公式只数 house / village_house，不数 city_house 与版图，
  //    于是从 E4（K 上千）跃迁到 E5 后 K 会**断崖式塌到几十**，
  //    人口被逻辑斯谛曲线拖向新 K，表现为"进入 E5 后人口一路归零"。
  //    跃迁不重置是这个项目的铁律（E2→E3→E4 都严格遵守），E5 必须一致。
  if (state.era === 'E5') {
    const cityHouses = state.buildings.city_house ?? 0;
    const potatoK = state.techs['new_crops'] ? E5.POP_K_POTATO : 0;
    const legacyHousing =
      cityHouses * E3.POP_PER_CITY_HOUSE +
      houses * POPULATION.CAPACITY_PER_HOUSE +
      villageHouses * E2.CAPACITY_PER_VILLAGE_HOUSE +
      Math.min(fields, Math.floor(farmers / E2.FIELD_MIN_FARMERS)) * E2.CAPACITY_PER_FIELD;
    return (
      E5.POP_K_BASE +
      houses * E5.POP_K_PER_HOUSE +
      potatoK +
      legacyHousing +
      getTerritoryCapacity(state)
    );
  }

  // ── E6 机器时代：人口模型切换（E6-machine.md §11.4）──
  //
  // K = E6 基础 900 + 工人住宅×200 + 旧时代全部遗产 + 版图
  //
  // ⚠️ 这是**同一个 bug 的第三次复现，必须记下来**：
  //    E5 当年漏了这个分支，从 E4（K 上千）跃迁后 K 断崖到几十，人口归零。
  //    E6 实装时又漏了一次 —— e6-autoplay 第一轮跑出「1200 人开局，
  //    5 秒内人口归零」，实测 getCapacity 返回 84。
  //    根因完全相同：默认公式只数 house / village_house，
  //    不数 city_house、不数 worker_housing、不数版图。
  //
  //    教训：**每新增一个时代，必须同步在 getCapacity 加分支**，
  //    否则"跃迁只新增不重置"这条铁律会在人口维度上被静默违反。
  //    检查清单见 DEV-GUIDE §十一。
  if (state.era === 'E6') {
    const cityHouses = state.buildings.city_house ?? 0;
    const legacyHousing =
      cityHouses * E3.POP_PER_CITY_HOUSE +
      houses * POPULATION.CAPACITY_PER_HOUSE +
      villageHouses * E2.CAPACITY_PER_VILLAGE_HOUSE +
      Math.min(fields, Math.floor(farmers / E2.FIELD_MIN_FARMERS)) * E2.CAPACITY_PER_FIELD;
    return (
      E6.POP_K_BASE +
      (state.buildings.worker_housing ?? 0) * E6.POP_K_PER_HOUSING +
      // E5 的住所加成继续生效（跃迁不重置）：新作物马铃薯的 K 不被抹掉
      houses * E5.POP_K_PER_HOUSE +
      (state.techs['new_crops'] ? E5.POP_K_POTATO : 0) +
      legacyHousing +
      getTerritoryCapacity(state)
    );
  }

  // 只有「已耕作」的田地才算承载力：田地必须凑够最低农夫数才在种。
  const cultivatedFields = Math.min(
    fields,
    Math.floor(farmers / E2.FIELD_MIN_FARMERS)
  );

  // E1 的住所不会因为进入定居时代而失效——跃迁瞬间 K 必须连续。
  // 设计文档 §6：E2 起始 K=16 = E1 基础 4 + 3 住所 × 4。
  // 定居时代在此之上叠加村落民居与已耕作田地。
  return (
    POPULATION.BASE_CAPACITY +
    houses * POPULATION.CAPACITY_PER_HOUSE +
    villageHouses * E2.CAPACITY_PER_VILLAGE_HOUSE +
    cultivatedFields * E2.CAPACITY_PER_FIELD
  );
}

export function getFoodConsumption(state: E1State): number {
  // E3 人口消耗 0.2/秒/人（与 E1 相同；E2 为 0.25 因定居后更集中）
  const perPerson = state.era === 'E3' ? E3.POP_FOOD_PER_PERSON : POPULATION.FOOD_CONSUMPTION_PER_PERSON;
  return state.population * perPerson;
}

export function getFoodProduction(state: E1State): number {
  return calcResourceOutput('food', state);
}

export function getFoodFactor(state: E1State): number {
  // ── E2 定居时代：主粮换成谷物 ──
  //
  // 流式「产出/消耗」比值在这里没有意义：定居时代的问题不是"今天够不够吃"，
  // 而是"入冬前攒了多少"。所以食物因子直接由人均储粮推导
  // （设计文档 §5：≥60→1.0，≥32→0.8，≥12→0.4，<12→0，=0→−0.5）。
  if (aggregateEffects(state).seasonsEnabled) {
    // 定居/E3 时代：人均「存量秒数」决定食物因子（与消耗率无关的口径）。
    // storedSec = food / (population × perSec)；perSec 取本时代人均消耗。
    // 48/128/240 秒与 E2 原 12/32/60 粮完全等价，E2 行为逐字节不变，E3 自动适配。
    const perSec = state.era === 'E3' ? E3.POP_FOOD_PER_PERSON : E2.FOOD_PER_PERSON_SEC;
    const storedSec =
      state.population > 0 ? state.food / (state.population * perSec) : state.food / perSec;
    return getFoodFactorFromStorage(storedSec);
  }

  const prod = getFoodProduction(state);
  const cons = getFoodConsumption(state);
  if (cons <= 0) return FOOD_FACTOR.ABUNDANT;
  if (state.food <= 0 && prod < cons) return FOOD_FACTOR.FAMINE;
  if (prod < cons) return FOOD_FACTOR.TIGHT;
  if (prod > cons * 2) return FOOD_FACTOR.ABUNDANT;
  return FOOD_FACTOR.NORMAL;
}

/**
 * 季节人口增长率乘数（非负）。
 *
 * 设计修复（「冬季反号」bug）：原 getSeasonGrowthFactor 冬季返回 −0.15（负数），
 * 与 foodFactor 相乘产生「负×负=正」的符号交互 bug —— 饿肚子冬天人口反而增长，
 * 储粮越足掉得越快。修复后本函数永不为负：冬季用 WINTER_RATE_MULTIPLIER（0.4）
 * 只放慢增长，真正的减员方向完全由食物决定（见 getWinterAttrition）。
 * E1 无季节（seasonsEnabled=false）→ 恒为 1.0，远古时代配平逐字节不变。
 */
function getSeasonGrowthMultiplier(state: E1State): number {
  if (!aggregateEffects(state).seasonsEnabled) return 1;
  return getSeasonRateMultiplier(state.eraElapsedSec);
}

/**
 * 冬季缺粮独立减员（每秒）。
 *
 * 与 logistic 增长项**独立**：只在「季节循环开启 + 当前为冬季 + 人均储粮 < 阈值」时触发。
 * 方向只由食物决定 —— 修复原 seasonR 负值与 foodFactor 的符号交互缺陷：
 *   · 原 bug：food=0 时 foodFactor=−0.5，负×负=正 → 饿肚子冬天反而增长；
 *   · 现修复：减员只在这里以「正扣除」表达，且要求人均储粮不足才扣。
 * population<=0 视为充裕（不会饿死），不触发减员。
 */
function getWinterAttrition(state: E1State): number {
  const eff = aggregateEffects(state);
  if (!eff.seasonsEnabled) return 0;
  if (getSeasonFromElapsed(state.eraElapsedSec) !== 'winter') return 0;
  if (state.population <= 0) return 0;
  const perPerson = state.food / state.population;
  if (perPerson >= POPULATION.WINTER_STORED_FOOD_THRESHOLD) return 0;
  return POPULATION.WINTER_ATTRITION_PER_SEC;
}

/**
 * 计算单帧人口增量 = logistic 项 − 冬季减员。
 * foodFactor<0（食物耗尽）优先级最高，直接饥荒衰减。
 * 各分支（无火 / E1 / E3 / 通用）统一复用本函数，避免复制粘贴导致季节处理不一致。
 */
function applyLogisticGrowth(state: E1State, r0: number, P: number, K: number): number {
  const foodFactor = getFoodFactor(state);
  // 饥荒路径保留：food=0 时 foodFactor<0，优先级最高
  if (foodFactor < 0) return -POPULATION.STARVATION_DECAY;
  const logistic = r0 * P * (1 - P / K) * foodFactor;
  // 冬季缺粮减员：独立于 logistic，方向只由食物决定（修复负号交互 bug）
  return logistic - getWinterAttrition(state);
}

/** 人口增长速率（每秒），可正可负 */
export function getPopulationGrowth(state: E1State): number {
  const eff = aggregateEffects(state);
  const K = getCapacity(state);
  const P = state.population;

  // 季节增长率乘数：E1 无季节恒为 1.0；E2+ 用非负乘数（冬季放慢但不反号）。
  const seasonMult = getSeasonGrowthMultiplier(state);

  // E4 的人口上限由版图、民居与军屯共同决定；已删除的秩序/覆盖率系统不参与计算。
  if (state.era === 'E4') {
    return applyLogisticGrowth(state, 0.004 * seasonMult, P, K);
  }

  // 火种系统尚未开启（还没研究「掌握火」）：
  // 此时不存在"熄灭惩罚"，火源因子按中性 1.0 处理。
  // —— 否则开局 fire=0 会被误判为"火灭了"，人口在几秒内死光。
  if (!eff.fireEnabled) {
    const r0 = POPULATION.BASE_GROWTH_RATE * seasonMult;
    return applyLogisticGrowth(state, r0, P, K);
  }

  // 火源因子：定居时代（E2 起）火源转为恒定，不再作为生存开关。
  // 设计文档 §13：「火源 · 人口舒适度基础」，标签为「当前 ×1.0（恒定，无需维护）」。
  // 若沿用 E1 的「熄灭 → 饥荒」规则，玩家只要带着 fire=0 跃迁（例如木材耗尽时），
  // 定居时代就会陷入永久 −0.5/秒 的人口衰减 —— 一个玩家无法自救的死局。
  const fireFactor = state.era === 'E1' ? getFireFactor(state) : 1;

  // 火种已开启但熄灭了 → 生存惩罚（仅远古时代）
  if (fireFactor === 0) return -POPULATION.STARVATION_DECAY;

  // ── E3 城邦时代：人口模型切换 ──
  // E3 基础增长率从 0.03 下调到 0.003（更慢的增长配合更低的资源门槛）。
  // 贸易繁荣 / 农业底线三因子首版留为 TODO(balance)：先用 1.0。
  if (state.era === 'E3') {
    const r0 = E3.POP_GROWTH_RATE * fireFactor * seasonMult;
    return applyLogisticGrowth(state, r0, P, K);
  }

  const r0 = POPULATION.BASE_GROWTH_RATE * fireFactor * seasonMult;
  return applyLogisticGrowth(state, r0, P, K);
}

// ─────────────────────────────────────────────
// T2.3 资源产出
// ─────────────────────────────────────────────

export function calcJobOutput(jobId: JobId, state: E1State): number {
  const def = JOB_MAP[jobId];
  const count = state.jobs[jobId] ?? 0;
  if (count <= 0) return 0;

  const eff = aggregateEffects(state);
  const workshops = state.buildings.workshop ?? 0;

  // 猎人：猎场承载力模型 —— 总产出按饱和曲线收敛，替代「单人产出 × 人数」的线性公式。
  // 场地能养活的猎物有上限（HUNT.CAP），猎人越多边际产出越低。
  // 见 data/constants.ts 的 HUNT 注释。工具世代与集体围猎加成仍在下方叠加。
  let rate =
    jobId === 'hunter'
      ? HUNT.CAP * (1 - Math.exp(-count / HUNT.TAU))
      : def.outputRate * count;

  if (def.scaledByTool) {
    const workshopBonus = workshops * BUILDING_EFFECTS.WORKSHOP_BONUS;
    rate *= getToolMultiplier(eff.toolTier, workshopBonus);
  }
  if (jobId === 'gatherer') rate *= eff.gathererMultiplier;
  if (jobId === 'hunter' && eff.huntPartyThreshold > 0 && count >= eff.huntPartyThreshold) {
    rate *= 1 + eff.huntPartyBonus;
  }

  // ── E2 定居时代 ──

  // 科技给的按岗位乘数（跨时代通用）
  rate *= eff.jobMultiplier[jobId] ?? 1;

  if (eff.seasonsEnabled) {
    if (jobId === 'farmer') {
      // 田地效率：田地是农夫的工作位，农夫不够就有一部分田闲着。
      // 覆盖度 = min(上限, 农夫数 / (田数×每田工位))；没有田则不产出。
      const fields = state.buildings.field ?? 0;
      const coverage =
        fields > 0
          ? Math.min(eff.fieldEfficiencyCap, count / (fields * E2.JOBS_PER_FIELD))
          : 0;
      rate *=
        getSeasonOutputMultiplier(state.eraElapsedSec, true) * coverage * eff.fieldYieldMul;
    } else if (jobId === 'woodcutter' || jobId === 'knapper') {
      // 冬季伐木/打石 ×0.7
      rate *= getSeasonOutputMultiplier(state.eraElapsedSec, false);
    }
    // 牧人 / 织工 / 猎人：无季节波动
    if (jobId === 'herder' && getSeasonFromElapsed(state.eraElapsedSec) === 'summer') {
      rate *= eff.summerHerderMul;
    }
  }

  // ── E3 城邦时代：通用规模模型 ──
  //
  // 03-economy-and-growth-plan.md §5 已废除 E3 通用「N^0.9 规模递减」，
  // 改为 §4 的职业分类模型：A 普通线性 / B 环境型(猎人饱和) / C 工位型(农夫·牧人)
  // / D 投入型(冶炼) / E 网络型(商人) / F 机会成本型(书吏)。
  // 各职业的主规模机制（猎人 HUNT.CAP 饱和、农夫 field×JOBS_PER_FIELD 覆盖度等）
  // 已在上方各自实现，此处不再叠加任何通用规模公式——普通职业即为线性 outputRate×count。
  // ⚠️ 原 E3.SCALING_EXP 常量（constants.ts）现已无引用；因禁止改动该文件，保留为死常量。

  return rate;
}

export function calcResourceOutput(resourceId: ResourceId, state: E1State): number {
  if (resourceId === 'experience') return calcExperienceOutput(state);
  if (resourceId === 'population') return getPopulationGrowth(state);

  const eff = aggregateEffects(state);
  let total = 0;

  if (state.era === 'E4' && resourceId === 'iron') {
    return (state.jobs.iron_miner ?? 0) * E4.IRON_MINER_RATE * eff.ironOutputMul * getTerritoryOutputMultiplier(state) * getNetImperialOutputMultiplier(state);
  }
  if (state.era === 'E4' && resourceId === 'coin') {
    const mintWorkers = Math.min(
      state.jobs.mint_worker ?? 0,
      (state.buildings.mint ?? 0) * E4.MINT_WORKERS_PER_BUILDING
    );
    const gross = mintWorkers * E4.COIN_MINT_RATE;
    const ironAvailable = Math.max(0, state.iron ?? 0);
    const ironRate = mintWorkers * E4.COIN_MINT_RATE * E4.MINT_IRON_PER_COIN;
    return ironRate > 0 ? gross * eff.coinOutputMul * Math.min(1, ironAvailable / ironRate) * getTerritoryOutputMultiplier(state) * getNetImperialOutputMultiplier(state) : 0;
  }

  for (const job of JOBS) {
    if (job.output !== resourceId) continue;
    total += calcJobOutput(job.id, state);
  }

  if (resourceId === 'food') {
    total *= 1 + getFireFoodBonus(state);
    total *= eff.foodMultiplier;
  }
  if (resourceId === 'stone') total *= eff.stoneMultiplier;
  if (state.era === 'E4') total *= getTerritoryOutputMultiplier(state) * getNetImperialOutputMultiplier(state);

  // ── E2 ──
  // 「食物总产出 ×N」类科技（原 grainMultiplier，谷物合并前的作用对象）
  // 现在作用于合并后的食物产出——采集/狩猎/农耕一视同仁。
  if (resourceId === 'food') total *= eff.grainMultiplier;
  if (resourceId === 'livestock') total *= eff.livestockFoodMul;

  // 科技给的按资源乘数（跨时代通用）
  const perResource = eff.resourceMultiplier[resourceId];
  if (perResource !== undefined) total *= perResource;

  // ── E3 城邦时代：矿工的科技追加产出 ──
  //
  // 2026-09-13 用户拍板「移除矿脉随机制」：铜/锡不再取决于开局随机抽定的
  // localOre，而是由**科技**决定矿工产出什么——
  //   · 铜矿开采（copper_mining）→ 每名矿工追加铜 0.06/秒
  //   · 锡矿开采（tin_mining）   → 每名矿工追加锡 0.03/秒
  //   · 深井采矿（deep_mining）  → 全部采掘产出 ×1.5
  // 基础石料产出走上方 JOBS 循环（miner.output === 'stone'）。
  // 加法速率键走 addR（时代衰减 + 口头折算），乘数键走 mulR，与书吏口径一致。
  if (state.era === 'E3') {
    const miners = state.jobs.miner ?? 0;
    if (miners > 0 && (resourceId === 'copper' || resourceId === 'tin')) {
      const rate = resourceId === 'copper' ? eff.minerCopperRate : eff.minerTinRate;
      total += miners * rate * eff.minerOutputMul;
    }
  }

  return total;
}

// -----------------------------------------------------------------------------
// E4 帝国规则：所有函数均保持时代门控，E1-E3 返回中性值。
// -----------------------------------------------------------------------------
/** E4 的产出只受文明遗产影响；已删除的旧秩序/维稳系统不参与计算。 */
export function getNetImperialOutputMultiplier(state: E1State): number {
  return state.era === 'E4' ? getLegacyBonus(state) : 1;
}

/** P1 遗产收益：每点基础 +3%，边际按平方根递减；未解锁时完全中性。 */
export function getLegacyBonus(state: E1State): number {
  if (!state.p1Unlocked) return 1;
  const points = Math.max(0, state.legacyPoints ?? 0);
  return 1 + 0.03 * Math.sqrt(points);
}

/** E4 版图物产收益：版图是扩张流的核心正反馈，科技只做额外乘算。 */
export function getTerritoryOutputMultiplier(state: E1State): number {
  if (state.era !== 'E4') return 1;
  const territory = Math.max(1, state.territory ?? 1);
  return (1 + 0.08 * (territory - 1)) * aggregateEffects(state).territoryOutputMul;
}

/** 武库为军团提供装备、整备与轮换能力，每座提高 5% 战力，最多 20%。 */
export function getArmoryLegionBonus(state: E1State): number {
  return Math.min(0.2, Math.max(0, (state.buildings.armory ?? 0) * 0.05));
}

/** 军团综合战力：科技加成 × 武库装备加成。 */
export function getLegionPower(state: E1State): number {
  return aggregateEffects(state).legionPowerMul * (1 + getArmoryLegionBonus(state));
}

export function getCoinSpendPerSec(state: E1State): number {
  if (state.era !== 'E4') return 0;
  const legions = Math.max(0, state.jobs.legion ?? state.legions ?? 0);
  const armoryPayMul = Math.max(0.85, 1 - (state.buildings.armory ?? 0) * 0.03);
  return legions * E4.LEGION_COIN_PER_SEC * aggregateEffects(state).legionPayMul * armoryPayMul;
}


export function getTerritoryCapacity(state: E1State): number {
  if (state.era !== 'E4') return 0;
  const n = Math.max(1, state.territory ?? 1);
  return E4.BASE_TERRITORY_CAPACITY * n ** 0.85 * aggregateEffects(state).territoryCapacityMul;
}

export interface ExpansionRequirement {
  territory: number;
  targetN: number;
  coinCost: number;
  ironCost: number;
  legionNeed: number;
  flatSec: number;
}

/** E4 征伐的唯一公式源：store、UI 与自动试玩都从这里取要求。 */
export function getExpansionRequirement(state: E1State): ExpansionRequirement | null {
  if (state.era !== 'E4') return null;
  const territory = Math.max(1, state.territory ?? 1);
  if (territory >= E4.MAX_TERRITORY) return null;
  const eff = aggregateEffects(state);
  const targetN = territory + 1;
  const rawLegionNeed = E4.EXPANSION_LEGION_BASE + E4.EXPANSION_LEGION_PER_TERRITORY * (territory - 1);
  return {
    territory,
    targetN,
    coinCost: Math.ceil(E4.EXPANSION_COIN_BASE * territory ** E4.EXPANSION_COIN_EXP * eff.expansionCostMul),
    ironCost: Math.ceil(E4.EXPANSION_IRON_BASE * territory ** E4.EXPANSION_IRON_EXP * eff.expansionCostMul),
    legionNeed: Math.max(1, Math.ceil(rawLegionNeed / Math.max(0.1, getLegionPower(state)))),
    flatSec: (E4.EXPANSION_FLAT_BASE_SEC + E4.EXPANSION_FLAT_PER_TERRITORY_SEC * territory) * eff.expansionFlatMul,
  };
}

// ─────────────────────────────────────────────
// T2.3b 资源净速率（毛产出 − 冶炼消耗）
// ─────────────────────────────────────────────
/**
 * 资源的**净变化速率**（每秒），用于 UI 速率显示。
 *
 * 为什么显示净速率而不是毛速率：
 * 毛速率（calcResourceOutput）只算产出，没算消耗。E3 铜/锡会被冶炼工
 * 每秒吃掉一部分（smelters×SMELT_COPPER_IN / SMELT_TIN_IN，需 bronze_smelting），
 * 于是玩家看到"有产量但存量不动"——毛速率虚高、存量被反吞。
 * 净速率 = 毛产出 − 冶炼消耗速率，负数代表入不敷出（是有效告警信息，不强行夹 0）。
 *
 * 口径：
 *   · E3 的 copper/tin：毛产出 − 冶炼消耗（仅当已研究 bronze_smelting 且有人当冶炼工）
 *   · bronze：毛产出（青铜只产不耗，毛产出即净速率）
 *   · 其余资源（含 E1/E2 全量）：直接取 calcResourceOutput 原值（这些资源在 tick 里没有
 *     对应的"冶炼式"持续消耗，毛产出即净速率）
 */
export function getNetResourceRate(id: ResourceId, state: E1State): number {
  const gross = calcResourceOutput(id, state);

  if (state.era === 'E3' && (id === 'copper' || id === 'tin')) {
    const smelters = state.jobs.smelter ?? 0;
    if (smelters > 0 && state.techs.bronze_smelting) {
      const per =
        id === 'copper' ? E3.SMELT_COPPER_IN : E3.SMELT_TIN_IN;
      // 可为负数：冶炼吃掉的超过矿工挖出的，代表存量正在被反吞
      return gross - smelters * per;
    }
  }

  return gross;
}

// ─────────────────────────────────────────────
// T2.4 研究货币产出（经验 ⚡ / 知识 📜 同一字段）
// ─────────────────────────────────────────────
/**
 * 研究货币（experience 字段）的产出速率。
 *
 * - E1/E2：人口 × EXP_PER_PERSON（0.08/人/秒）—— **逐字节不变**
 * - E3 起：由**书吏**产出（0.15/秒/人 × 书吏训练/六十进制加成 × 档案库加成）。
 *   设计明确 E3 关闭"人口生经验"通道（用户拍板：字段改名「知识」，不新增字段）。
 *
 * 按时代门控：E1/E2 走旧路径，E3 走书吏路径。
 */
export function calcExperienceOutput(state: E1State): number {
  const eff = aggregateEffects(state);

  if (state.era === 'E3') {
    // E3 起点保护：楔形文字是书吏的前置，而书吏又是正式知识产出的来源。
    // 若严格关闭人口经验通道，E2 末尾刚好花光经验的存档会形成无法研究首项科技的死锁。
    // 在楔形文字完成前（以及书吏尚未培养时）保留一段较慢的文明积累（bootstrap 通道）。
    const bootstrapPath = state.population * POPULATION.EXP_PER_PERSON * E3.BOOTSTRAP_EXP_MULTIPLIER;
    if (!state.techs.cuneiform) {
      return bootstrapPath;
    }
    const scribes = state.jobs.scribe ?? 0;
    // 书吏尚未培养：保留 bootstrap 通道，避免"研究完楔形文字 → 知识产量断崖跌到 0"。
    if (scribes <= 0) return bootstrapPath;
    // 档案库加成：已刻录科技每项 +0.03（扩建后 0.04），与刻录本身解耦
    const archiveBonus = 1 + eff.archiveBonus * state.recordedOnce.length;
    // 03-economy-and-growth-plan.md §4.6：书吏属「F 机会成本型」，其约束来自人口机会成本
    // （占用的手不能去种田/打猎）、记录容量（recordCapacityAdd 上限）与科技消耗，
    // 不来自 N^0.9 规模递减。故书吏知识产出恢复线性 scribes×0.15×加成（§5 已废除通用 N^0.9）。
    const scribePath = scribes * 0.15 * eff.scribeOutputMul * archiveBonus;
    // 平滑交接：用 max 而不是硬切换——书吏经济自然长大后再接管 bootstrap 通道，
    // 两条曲线在交叉点自然衔接，避免研究楔形文字 / 初派书吏时产量断崖下跌。
    return Math.max(bootstrapPath, scribePath);
  }

  // E4 起文字已成为基础设施：知识仍写入既有 experience 字段。
  // 版图扩张带来稳定的人口与交流规模，是统一时代的研究主通道。
  if (state.era === 'E4') {
    return state.population * 0.02 * getTerritoryOutputMultiplier(state) * getLegacyBonus(state);
  }

  return state.population * POPULATION.EXP_PER_PERSON * eff.expMultiplier;
}

// ─────────────────────────────────────────────
// 建筑
// ─────────────────────────────────────────────
export function getBuildingCost(
  buildingId: BuildingId,
  state: E1State
): Partial<Record<ResourceId, number>> {
  const def = BUILDING_MAP[buildingId];
  const owned = state.buildings[buildingId] ?? 0;
  const eff = aggregateEffects(state);
  // §3.1：科技折扣不能把最终成本降到基础成本以下。
  // costMultiplier≥1 时 Math.pow(...) 本身 ≥1，钳制只作用于科技折扣（buildingCostMultiplier<1）。
  const mult = Math.max(1, Math.pow(def.costMultiplier, owned) * eff.buildingCostMultiplier);

  // ── E6 首座样机例外（deadlock guard）──
  //
  // owned === 0 且有 protoCost 时改用样机价（纯木石），**不乘 costMultiplier**
  // （此时 mult 恒为 1 的基数，但样机是手工定制的整数价，不该被倍率扰动）。
  //
  // ⚠️ 这不是数值美化，是防死锁：工厂/蒸汽机/锅炉房/煤矿的正常成本都要
  //    工业品与钢，而工业品与钢恰恰要靠它们才能生产。若第一座也按正常价，
  //    则「无钢 → 造不了工厂 → 产不出工业品 → 永远无钢」形成闭环，
  //    E6 在任何开局下都无法推进 —— 与 E5 航海港的白银死锁完全同源。
  //    教训：**入口建筑不能消耗它自己产出的东西**。
  const baseCost = owned === 0 && def.protoCost ? def.protoCost : def.cost;

  const out: Partial<Record<ResourceId, number>> = {};
  for (const [res, amount] of Object.entries(baseCost)) {
    // 样机价不随数量递增（owned 恒为 0），故直接用 mult 也等价；此处统一处理。
    out[res as ResourceId] = Math.ceil((amount as number) * mult);
  }
  return out;
}

export function canAffordBuilding(buildingId: BuildingId, state: E1State): boolean {
  const cost = getBuildingCost(buildingId, state);
  // 成本键可能是任意资源（E1 用木材/石头，E2 起谷物也可能进入成本表），
  // 所以这里按资源名取存量，而不是只白名单 food/wood/stone。
  for (const [res, amount] of Object.entries(cost)) {
    const owned = state[res as keyof E1State];
    if (typeof owned !== 'number' || owned < (amount as number)) return false;
  }
  return true;
}

export function isBuildingUnlocked(buildingId: BuildingId, state: E1State): boolean {
  const def = BUILDING_MAP[buildingId];
  if (!def.requires.tech) return true;
  return !!state.techs[def.requires.tech];
}

// ── 住所链升级（2026-09-13 用户拍板：住所可经科技升级为后续时代的居住建筑）──

/** 住所链的进阶目标（无进阶关系的建筑返回 null） */
export function getUpgradeTarget(buildingId: BuildingId): BuildingId | null {
  return BUILDING_MAP[buildingId].upgradesTo ?? null;
}

/**
 * 旧建筑是否**当前就可供升级**：
 * 目标时代已到达 + 目标建筑已解锁（住所链的触发条件是科技）+ 手里有货。
 * 与 isBuildingBuildable 不同：升级目标没有 requires.tech 的（如 city_house）
 * 依时代到达即视为解锁。
 */
export function canUpgradeBuilding(buildingId: BuildingId, state: E1State): boolean {
  const target = getUpgradeTarget(buildingId);
  if (!target) return false;
  if ((state.buildings[buildingId] ?? 0) <= 0) return false;
  if (eraDistance(BUILDING_MAP[target].era, state.era) < 0) return false;
  return isBuildingUnlocked(target, state);
}

/**
 * 每座升级的材料价：目标建筑**基础成本** × UPGRADE_COST_RATIO（向上取整）。
 *
 * 为什么不用 getBuildingCost 的数量递增价：升级是存量转换（N 座旧住所 → N 座新民居），
 * 若按目标建筑已建数递增，玩家升级得越晚反而越贵，等于惩罚"继续用旧住所"的玩家。
 * 固定半价让"升级 vs 新建"成为一道清晰的取舍：省材料，但不增加额外的数量递增基数。
 */
export function getUpgradeCostPerUnit(
  buildingId: BuildingId
): Partial<Record<ResourceId, number>> {
  const target = getUpgradeTarget(buildingId);
  if (!target) return {};
  const out: Partial<Record<ResourceId, number>> = {};
  for (const [res, amount] of Object.entries(BUILDING_MAP[target].cost)) {
    out[res as ResourceId] = Math.ceil((amount as number) * UPGRADE_COST_RATIO);
  }
  return out;
}

/** 任意成本表的整体可负担性判断（供升级等非建造扣费复用） */
export function canAffordCost(
  cost: Partial<Record<ResourceId, number>>,
  state: E1State
): boolean {
  for (const [res, amount] of Object.entries(cost)) {
    const owned = state[res as keyof E1State];
    if (typeof owned !== 'number' || owned < (amount as number)) return false;
  }
  return true;
}

// ─────────────────────────────────────────────
// 岗位
// ─────────────────────────────────────────────
/**
 * 某岗位的工位上限（不限工位的岗位返回 Infinity）。
 *
 * 为什么需要它：岗位进阶**不能把人送进没有工位的地方**。
 * 农夫受「田地 ×3」限制、牧人受「畜栏 ×3」限制——
 * 若农业刚研究完就把采集者全转成农夫，而田地还没建，
 * 这些农夫产出为 0，玩家会在毫无预警的情况下断粮。
 */
export function getJobSlotCapacity(jobId: JobId, state: E1State): number {
  if (state.era === 'E4') {
    if (jobId === 'mint_worker') return Math.max(0, (state.buildings.mint ?? 0) * E4.MINT_WORKERS_PER_BUILDING);
    if (jobId === 'legion') {
      const buildingSlots = (state.buildings.legion_camp ?? 0) * 20 + (state.buildings.armory ?? 0) * 5;
      const populationQuota = state.population * 0.05 * getLegionPower(state);
      return Math.max(0, Math.min(buildingSlots, Math.floor(populationQuota)));
    }
    return Number.POSITIVE_INFINITY;
  }
  switch (jobId) {
    case 'farmer':
      return (state.buildings.field ?? 0) * E2.JOBS_PER_FIELD;
    case 'herder':
      return (state.buildings.animal_pen ?? 0) * E2.JOBS_PER_PEN;
    default:
      return Number.POSITIVE_INFINITY;
  }
}

/**
 * 一次岗位进阶是否可以发生。
 *
 * **判定只看时代**（2026-09-12 用户拍板）：
 *   「进入农耕（定居）时代后，采集者自动进阶为农夫」——
 *   因此规则是"目标岗位所属的时代已经到来"，而不是"目标岗位已解锁"。
 *
 * 为什么之前不是这样（历史记录，避免以后又改回去）：
 *   上一版要求 `isJobUnlocked(目标岗位)`（即「农业」科技已研究）**且有空工位**，
 *   理由是"农业刚研究完就把采集者全变成没田可种的农夫会当场断粮"。
 *   但那样一来，玩家在界面上几乎看不到这个机制（农业还没研究时一句提示都没有），
 *   而且进阶的时点被推迟到"研究完农业 + 建好田地"，与"时代推进带来职业专职化"
 *   的设计意图不符。用户明确要"进城农耕时代就转"，故改为按时代判定。
 *
 * 代价与补偿：无田地时农夫**产出为 0**，因此时代入口会给出明确警告
 * （见 store.advanceEra 的消息），岗位面板也会提示"需先建田地/研究农业"。
 */
export function canUpgradeJob(state: E1State, from: JobId): JobId | null {
  const up = JOB_MAP[from].upgradesTo;
  if (!up) return null;
  if ((state.jobs[from] ?? 0) <= 0) return null;
  const target = JOB_MAP[up.job];
  // 目标岗位所属时代已到来（两种触发方式的公共前提）
  if (eraDistance(target.era, state.era) < 0) return null;
  if (up.trigger === 'tech') {
    // 科技触发（打石者→矿工，2026-09-13 拍板）：还需目标岗位的前置科技已研究。
    // 时代一到就转会产生"凭空出现的空岗位"，且与"解锁对应科技后进阶"的预期不符。
    const tech = target.requires.tech;
    if (tech && !state.techs[tech]) return null;
  }
  return up.job;
}

/**
 * 推进一次岗位进阶（每 tick 调用；每次最多转换 1 人）。
 *
 * 为什么每 tick 只转 1 人而不是一次转完：
 * 逐人转换让"职业逐渐专职化"这件事在界面上看得见。
 * 时代入口处会先做一次**批量转换**（见 applyJobUpgradeAll），
 * 所以这里主要处理"玩家在此之后又把某人派回采集者"的情况。
 *
 * 返回新的岗位表与本次转换信息；无进阶可做时返回 null（调用方应保持原对象）。
 */
export function applyJobUpgrade(
  state: E1State
): { jobs: Record<string, number>; from: JobId; to: JobId } | null {
  for (const def of JOBS) {
    const to = canUpgradeJob(state, def.id);
    if (!to) continue;
    const jobs = { ...state.jobs };
    jobs[def.id] = (state.jobs[def.id] ?? 0) - 1;
    jobs[to] = (state.jobs[to] ?? 0) + 1;
    return { jobs, from: def.id, to };
  }
  return null;
}

/**
 * 一次性完成所有可进行的进阶（时代入口调用）。
 *
 * 时代入口用批量而不是逐 tick：玩家跨过时代边界的那一刻，
 * "我的采集者成了农夫"应当是**一个事件**，而不是几秒钟内陆续发生。
 */
export function applyJobUpgradeAll(
  state: E1State
): { jobs: Record<string, number>; moved: Array<{ from: JobId; to: JobId; count: number }> } | null {
  const jobs = { ...state.jobs };
  const moved: Array<{ from: JobId; to: JobId; count: number }> = [];

  for (const def of JOBS) {
    const to = canUpgradeJob({ ...state, jobs }, def.id);
    if (!to) continue;
    const count = jobs[def.id] ?? 0;
    jobs[def.id] = 0;
    jobs[to] = (jobs[to] ?? 0) + count;
    moved.push({ from: def.id, to, count });
  }

  return moved.length > 0 ? { jobs, moved } : null;
}

export function isJobUnlocked(jobId: JobId, state: E1State): boolean {
  const def = JOB_MAP[jobId];
  if (def.requires.tech && !state.techs[def.requires.tech]) return false;
  if (def.requires.toolTier !== undefined) {
    if (aggregateEffects(state).toolTier < def.requires.toolTier) return false;
  }
  return true;
}

export function getAssignedPopulation(state: E1State): number {
  return Object.values(state.jobs).reduce((s, n) => s + n, 0);
}

export function getIdlePopulation(state: E1State): number {
  return Math.max(0, state.population - getAssignedPopulation(state));
}

// ─────────────────────────────────────────────
// T2.5 科技树引擎
// ─────────────────────────────────────────────
export interface ResearchCheck {
  ok: boolean;
  reason?: string;
}

export function canResearch(techId: string, state: E1State): ResearchCheck {
  const def = TECH_MAP[techId];
  if (!def) return { ok: false, reason: '未知科技' };
  if (state.techs[techId]) return { ok: false, reason: '已研究' };

  for (const req of def.requires) {
    if (!state.techs[req]) {
      return { ok: false, reason: `需要「${TECH_MAP[req]?.name ?? req}」` };
    }
  }

  if (def.requiresAny && def.requiresAny.length > 0) {
    if (!def.requiresAny.some(r => state.techs[r])) {
      const names = def.requiresAny.map(r => `「${TECH_MAP[r]?.name ?? r}」`).join(' 或 ');
      return { ok: false, reason: `需走通任一条分支：${names}` };
    }
  }

  if (state.experience < def.cost) {
    return { ok: false, reason: `${researchCurrencyName(state.era)}不足（还差 ${Math.ceil(def.cost - state.experience)}）` };
  }

  if (eraDistance(def.era, state.era) < 0) {
    return { ok: false, reason: '该科技属于尚未到达的时代' };
  }

  return { ok: true };
}

/** 前置是否满足（不论经验够不够）—— 用于"可研究"高亮 */
export function isTechAvailable(techId: string, state: E1State): boolean {
  const def = TECH_MAP[techId];
  if (!def || state.techs[techId]) return false;
  for (const req of def.requires) {
    if (!state.techs[req]) return false;
  }
  if (def.requiresAny && def.requiresAny.length > 0) {
    if (!def.requiresAny.some(r => state.techs[r])) return false;
  }
  return true;
}

export function countResearched(state: E1State): number {
  return Object.values(state.techs).filter(Boolean).length;
}

// ─────────────────────────────────────────────
// T3.3 时代跃迁
// ─────────────────────────────────────────────
export interface AdvanceCheck {
  ok: boolean;
  items: { label: string; done: boolean; detail: string }[];
}

export function checkAdvance(state: E1State): AdvanceCheck {
  // 条件从时代配置表读取，不再硬编码 ——
  // 否则加入 E2 之后永远只检查 E1 的条件，到了 E2 就无法再跃迁到 E3
  const meta = ERAS[state.era];
  const { gateTech, advanceConditions: cond } = meta;
  const gateName = TECH_MAP[gateTech]?.name ?? gateTech;

  // ── 时代的「主粮」与「住所」在不同时代是不同字段 ──
  //
  //   E1 人口吃 food，住所是 house
  //   E2 人口改吃 grain（0.25/秒/人），住所由「住所 → 村落民居」升级为 village_house
  //
  // 不做这个映射，定居时代的跃迁检查会永远输出
  // 「食物储备 0/800」「建成住所 0/5」—— 因为这两个字段在 E2 根本不是主资源。
  // 玩家即便把 E2 玩到极致也永远无法跃迁，是硬阻断。
  //
  // ⚠️ ERAS.E1/E2 的 advanceConditions 数值本身仍是**占位值**（见 era.ts 注释），
  //    这里只修正"读哪个字段"，不动数值，配平定稿后仍需校准。
  //    E3 及以后若引入新的主粮 / 住所体系，需要在这里继续扩展映射。
  const settled = state.era !== 'E1';
  // 主粮：采集与农耕所得已合并为「食物」，两个时代都读同一个字段
  const staple = state.food;
  // 住所：住所（E1）与村落民居（E2）都提供承载力，跃迁后**两者并存**，
  // 所以门槛也要合计——否则玩家建了满村新民居，门槛却只数其中一种。
  const housing = (state.buildings.house ?? 0) + (state.buildings.village_house ?? 0);
  const stapleLabel = '食物储备';
  const housingLabel = settled ? '住所/村落民居' : '住所';

  const items: AdvanceCheck['items'] = [
    {
      label: `研究「${gateName}」`,
      done: !!state.techs[gateTech],
      detail: state.techs[gateTech] ? '已完成' : '尚未研究',
    },
  ];

  // ── 时间条件（E2 独有）──
  //
  // 「完整度过 ≥N 个冬季」是 E2 的毕业考试：核心机制是周期，所以条件也必须
  // 是周期性的 —— 否则玩家靠一次暴收就能攒够粮，却没有证明自己能重复这个周期。
  // 见 design/game/eras/E2-sedentary.md §11.8。
  if (cond.minYears !== undefined) {
    const years = Math.floor(state.eraElapsedSec / YEAR_DURATION_SEC);
    const need = cond.minYears * YEAR_DURATION_SEC;
    items.push({
      label: `完整度过 ≥ ${cond.minYears} 个冬季`,
      done: state.eraElapsedSec >= need,
      detail: `${years} / ${cond.minYears} 年`,
    });
  }

  // ── 资源与人口 ──
  if (cond.minFood !== undefined) {
    items.push({
      label: `${stapleLabel} ≥ ${cond.minFood}`,
      done: staple >= cond.minFood,
      detail: `${Math.floor(staple)} / ${cond.minFood}`,
    });
  }

  // ── 建筑门槛 ──
  if (cond.minHouses !== undefined) {
    items.push({
      label: `建成 ${cond.minHouses} 座${housingLabel}`,
      done: housing >= cond.minHouses,
      detail: `${housing} / ${cond.minHouses}`,
    });
  }
  for (const [buildingId, count] of Object.entries(cond.minBuildings ?? {})) {
    const owned = state.buildings[buildingId] ?? 0;
    const name = (BUILDING_MAP as Record<string, { name: string } | undefined>)[buildingId]?.name ?? buildingId;
    items.push({
      label: `建成 ${count} 座${name}`,
      done: owned >= count,
      detail: `${owned} / ${count}`,
    });
  }

  if (cond.minPopulation !== undefined) {
    items.push({
      label: `人口 ≥ ${cond.minPopulation}`,
      done: state.population >= cond.minPopulation,
      detail: `${Math.floor(state.population)} / ${cond.minPopulation}`,
    });
  }

  // ── E3 已刻录科技门槛（记录系统）──
  //
  // 「已刻录」是 E3 的核心矛盾：研究可以靠知识，但刻录要占槽位、
  // 付刻录费，且不可撤销。用「刻了多少」而不是「研究了多少」做毕业条件，
  // 逼玩家为知识做"确定性沉淀"——这正是"文明"的题中之义。
  if (cond.minRecorded !== undefined) {
    const recorded = state.recorded.length;
    items.push({
      label: `已刻录科技 ≥ ${cond.minRecorded} 项`,
      done: recorded >= cond.minRecorded,
      detail: `${recorded} / ${cond.minRecorded}`,
    });
  }

  // ── 资源存量门槛（E3：青铜 ≥ 2000）──
  // 通用字段：资源 id → 最低存量。E3 用它表达"青铜库存证明工业能力"。
  for (const [resId, amount] of Object.entries(cond.minResources ?? {})) {
    const value = state[resId as keyof E1State];
    const numeric = typeof value === 'number' ? value : 0;
    const resName = (RESOURCE_MAP as Record<string, { name: string } | undefined>)[resId]?.name ?? resId;
    items.push({
      label: `${resName} ≥ ${amount}`,
      done: numeric >= amount,
      detail: `${Math.floor(numeric)} / ${amount}`,
    });
  }

  // E4 统一条件：版图与铸币必须同时达标。
  if (cond.minTerritory !== undefined) {
    const territory = state.territory ?? 1;
    items.push({ label: `版图 ≥ ${cond.minTerritory}`, done: territory >= cond.minTerritory, detail: `${territory} / ${cond.minTerritory}` });
  }
  if (cond.minCoin !== undefined) {
    const coin = state.coin ?? 0;
    items.push({ label: `铸币 ≥ ${cond.minCoin}`, done: coin >= cond.minCoin, detail: `${Math.floor(coin)} / ${cond.minCoin}` });
  }

  // ── E3 特殊条件：钢铁必须已刻录 ──
  // devplan §7.2：跃迁六项条件中的第一项是「研究「钢铁」并完成刻录」。
  // 刻录是刻录系统本身的要求（铁门槛刻录需 1 槽），这里额外校验以防漏刻。
  if (state.era === 'E3' && state.techs.iron && !state.recorded.includes('iron')) {
    items.push({
      label: '钢铁刻录',
      done: false,
      detail: '已研究钢铁，但尚未刻录到泥板上',
    });
  }

  // ── E6 特殊条件：电网供电率 ρ ──
  //
  // 用**当前实时 ρ** 而不是"建了多少发电厂"：这一项考的是
  // "你的电够不够带满全部工厂"。建了 15 座工厂却只配 3 座电厂时
  // ρ 会掉到 0.3 一带，工厂虽"建成"产出却被电网掐住 ——
  // 这正是 E6 的核心权衡（产能扩张必须与电力建设同步）。
  if (cond.minRho !== undefined) {
    const rt = calcSupply(state);
    const rho = rt.rho;
    items.push({
      label: `电网供电率 ρ ≥ ${cond.minRho}`,
      done: rho >= cond.minRho,
      detail: `${(rho * 100).toFixed(0)}% / ${(cond.minRho * 100).toFixed(0)}%`,
    });
  }

  // ── E6 特殊条件：城市化率 ──
  //
  // 城市化不是免费的：它同时是拥挤系数与污染两个负向 r 因子的载体，
  // 所以这一项实际在考"你能不能把城市的代价治住"，而非"能堆多少住宅"。
  if (cond.minUrbanization !== undefined) {
    const u = getUrbanizationRate(state);
    items.push({
      label: `城市化率 ≥ ${(cond.minUrbanization * 100).toFixed(0)}%`,
      done: u >= cond.minUrbanization,
      detail: `${(u * 100).toFixed(0)}% / ${(cond.minUrbanization * 100).toFixed(0)}%`,
    });
  }

  return { ok: items.every(i => i.done), items };
}

// ─────────────────────────────────────────────
// 资源上限
// ─────────────────────────────────────────────
export function getResourceStorage(resourceId: ResourceId, state: E1State): number {
  const eff = aggregateEffects(state);
  switch (resourceId) {
    case 'food': {
      // 首轮实测 500 太早撞上限（10 分钟就满），浪费产出
      const base = 1000 * eff.foodStorageMultiplier;
      // 定居时代：粮仓体系并入食物上限（谷物合并后的结果）
      //
      // 原公式（独立谷物资源时）：(400 + Σ粮仓×单仓容量) × (1 + 陶窑加成 + 陶罐储藏) × (1 + 通风)
      // 现在这两种粮是一种，所以容量**相加**：
      //   E1 的储存技术（烟熏 ×2）继续生效，粮仓/陶窑/陶罐再加一层。
      // E1 没有季节循环（seasonsEnabled=false）→ 直接返回 base，逐字节不变。
      if (!eff.seasonsEnabled) return base;
      const granaries = state.buildings.granary ?? 0;
      const kilns = state.buildings.kiln ?? 0;
      const jarStorageBonus = eff.granaryCapacityMul - 1;
      const granaryCap = getGranaryCapacity(
        granaries,
        kilns,
        jarStorageBonus,
        eff.granaryPerUnit > 0 ? eff.granaryPerUnit : undefined,
        eff.kilnBonus > 0 ? eff.kilnBonus : undefined
      );
      // 通用仓库（E3 建筑）给食物上限再 +600/座；E1 无仓库、E2 仓库不可建，不影响旧时代
      return (
        base +
        granaryCap * (1 + eff.granaryOverflowBonus) +
        (state.buildings.warehouse ?? 0) * E3.WAREHOUSE_FOOD_BONUS
      );
    }
    case 'wood':
      // 基础建材容量 = 基础上限 500
      //   + Σ粮仓 ×300（「存储建筑双扩容」，见 storage-plan.md §4；粮仓是 E2 建筑，E1 无）
      //   + Σ通用仓库(warehouse) ×200（E3 通用仓库，散装建材扩容）
      return (
        500 +
        (state.buildings.granary ?? 0) * E2.GRANARY_WOOD_BONUS +
        (state.buildings.warehouse ?? 0) * E3.WAREHOUSE_BULK_BONUS
      );
    case 'stone':
      return (
        500 +
        (state.buildings.granary ?? 0) * E2.GRANARY_STONE_BONUS +
        (state.buildings.warehouse ?? 0) * E3.WAREHOUSE_BULK_BONUS
      );
    // E3 金属：铜/锡/青铜 共用建材仓储体系。
    // 扩容手段：city_house ×150（原）+ 通用仓库(warehouse) ×400（新增 E3 通用仓库）。
    case 'copper':
    case 'tin':
    case 'bronze':
      if (state.era !== 'E3') return Number.POSITIVE_INFINITY;
      return (
        500 +
        (state.buildings.city_house ?? 0) * 150 +
        (state.buildings.warehouse ?? 0) * E3.WAREHOUSE_METAL_BONUS
      );
    case 'iron':
      if (state.era !== 'E4') return Number.POSITIVE_INFINITY;
      return E4.IRON_STORAGE_BASE + (Math.max(1, state.territory ?? 1) - 1) * E4.IRON_STORAGE_PER_TERRITORY + (state.buildings.warehouse ?? 0) * E3.WAREHOUSE_METAL_BONUS + (state.buildings.armory ?? 0) * E4.ARMORY_IRON_STORAGE;
    case 'coin':
      if (state.era !== 'E4') return Number.POSITIVE_INFINITY;
      return 1_000_000;
    // 牲畜是活体储备，不占粮仓容量；织物同理
    default:
      return Number.POSITIVE_INFINITY;
  }
}

// ─────────────────────────────────────────────
// 资源上限构成明细（UI 悬浮提示用）
// ─────────────────────────────────────────────
export interface StorageBreakdownItem {
  /** 中文构成项标签（含数量，如「粮仓×3」） */
  label: string;
  /** 该项提供的上限数值（实时计算，不写死） */
  amount: number;
}

/**
 * 某资源上限的构成明细，供 UI 悬浮提示逐项展示。
 *
 * 返回数组各项的**实时数值之和 = getResourceStorage(id, state)**（不写死任何数）：
 *   · food：基础储量(1000×倍率) + 粮仓·陶窑·陶罐 + 粮仓溢出加成 + 通用仓库·食物
 *   · wood/stone：基础 500 + 粮仓×N + 通用仓库×N
 *   · copper/tin/bronze（仅 E3）：基础 500 + 民居×N + 通用仓库×N
 *   · 其余（livestock/fabric/experience/population，以及 E3 之前的金属）：返回 []，UI 显示「无上限」
 */
export function getStorageBreakdown(id: ResourceId, state: E1State): StorageBreakdownItem[] {
  const eff = aggregateEffects(state);
  switch (id) {
    case 'food': {
      const base = 1000 * eff.foodStorageMultiplier;
      if (!eff.seasonsEnabled) {
        return [{ label: `基础储量 (×${eff.foodStorageMultiplier})`, amount: base }];
      }
      const granaries = state.buildings.granary ?? 0;
      const kilns = state.buildings.kiln ?? 0;
      const jarStorageBonus = eff.granaryCapacityMul - 1;
      const granaryCap = getGranaryCapacity(
        granaries,
        kilns,
        jarStorageBonus,
        eff.granaryPerUnit > 0 ? eff.granaryPerUnit : undefined,
        eff.kilnBonus > 0 ? eff.kilnBonus : undefined
      );
      const items: StorageBreakdownItem[] = [
        { label: `基础储量 (×${eff.foodStorageMultiplier})`, amount: base },
      ];
      // getGranaryCapacity 已把「400 基础 + 粮仓 + 陶窑/陶罐加成」打包成一项
      if (granaryCap > 0) {
        items.push({
          label: `粮仓·陶窑·陶罐 (粮仓×${granaries}${kilns > 0 ? `，陶窑×${kilns}` : ''})`,
          amount: granaryCap,
        });
      }
      // 粮仓溢出加成：单独列出以解释"为什么食物上限比粮仓本身还大"
      if (eff.granaryOverflowBonus > 0) {
        items.push({
          label: `粮仓溢出加成 (×${eff.granaryOverflowBonus})`,
          amount: granaryCap * eff.granaryOverflowBonus,
        });
      }
      const warehouseFood = (state.buildings.warehouse ?? 0) * E3.WAREHOUSE_FOOD_BONUS;
      if (warehouseFood > 0) {
        items.push({
          label: `通用仓库·食物 (×${state.buildings.warehouse ?? 0})`,
          amount: warehouseFood,
        });
      }
      return items;
    }
    case 'wood':
    case 'stone': {
      const bulk = id === 'wood' ? E2.GRANARY_WOOD_BONUS : E2.GRANARY_STONE_BONUS;
      const items: StorageBreakdownItem[] = [{ label: '基础储存', amount: 500 }];
      const granaries = state.buildings.granary ?? 0;
      if (granaries > 0) {
        items.push({ label: `粮仓 (×${granaries})`, amount: granaries * bulk });
      }
      const warehouses = state.buildings.warehouse ?? 0;
      if (warehouses > 0) {
        items.push({ label: `通用仓库 (×${warehouses})`, amount: warehouses * E3.WAREHOUSE_BULK_BONUS });
      }
      return items;
    }
    case 'copper':
    case 'tin':
    case 'bronze': {
      if (state.era !== 'E3') return [];
      const items: StorageBreakdownItem[] = [{ label: '基础储量', amount: 500 }];
      const cityHouses = state.buildings.city_house ?? 0;
      if (cityHouses > 0) {
        items.push({ label: `民居 (×${cityHouses})`, amount: cityHouses * 150 });
      }
      const warehouses = state.buildings.warehouse ?? 0;
      if (warehouses > 0) {
        items.push({ label: `通用仓库 (×${warehouses})`, amount: warehouses * E3.WAREHOUSE_METAL_BONUS });
      }
      return items;
    }
    case 'iron':
      if (state.era !== 'E4') return [];
      return [
        { label: '基础储量', amount: E4.IRON_STORAGE_BASE },
        ...(state.buildings.warehouse ?? 0) > 0
          ? [{ label: `通用仓库 (×${state.buildings.warehouse ?? 0})`, amount: (state.buildings.warehouse ?? 0) * E3.WAREHOUSE_METAL_BONUS }]
          : [],
        ...(state.buildings.armory ?? 0) > 0
          ? [{ label: `武库 (×${state.buildings.armory ?? 0})`, amount: (state.buildings.armory ?? 0) * E4.ARMORY_IRON_STORAGE }]
          : [],
      ];
    case 'coin':
      if (state.era !== 'E4') return [];
      return [{ label: '流动资金上限', amount: 1_000_000 }];
    default:
      return [];
  }
}

// ─────────────────────────────────────────────
// T4.6 卡点提示
// ─────────────────────────────────────────────
export function getBottleneck(state: E1State): string | null {
  const eff = aggregateEffects(state);
  if (!eff.fireEnabled) return null;

  // ── E2 定居时代：压力从「火种」换成「季节 + 谷仓」 ──
  // 火源在本时代恒定、无需维护，因此不再作为卡点提示（否则会一直误报"火源太弱"）
  if (eff.seasonsEnabled) {
    if (getFoodFactor(state) <= 0) {
      return '谷仓告急 —— 秋季派更多人下田，或宰杀牲畜换粮';
    }
    if (getPopulationGrowth(state) <= 0.001 && state.population >= getCapacity(state) - 0.5) {
      const farmers = state.jobs.farmer ?? 0;
      const fields = state.buildings.field ?? 0;
      if (fields > 0 && farmers < fields * E2.JOBS_PER_FIELD) {
        return '田地缺人耕作 —— 每块田需至少 2 名农夫才计入承载力';
      }
      return '住处不足 —— 建造村落民居，或开垦更多田地提升人口上限';
    }
    return null;
  }

  // ── E1 远古时代：火源 → 人口上限 → 食物 ──
  if (getFireFactor(state) <= 0.5) {
    return '火源太弱 —— 派更多人去伐木，或手动投入木材';
  }
  if (getPopulationGrowth(state) <= 0.001 && state.population >= getCapacity(state) - 0.5) {
    return '房屋不足 —— 建造更多住所提升人口上限';
  }
  if (getFoodFactor(state) <= 0) {
    return '食物短缺 —— 派更多人去采集或狩猎';
  }
  return null;
}

// ─────────────────────────────────────────────
// 批量推进（fastLoop 调用）
// ─────────────────────────────────────────────
export interface TickResult {
  food: number;
  wood: number;
  stone: number;
  experience: number;
  population: number;
  populationProgress: number;
  fire: number;
  // ── E2 定居时代 ──（食物已与谷物合并，不再单列）
  livestock: number;
  fabric: number;
  eraElapsedSec: number;
  // ── E3 城邦时代 ──
  copper: number;
  tin: number;
  bronze: number;
  lapis: number;
  iron: number;
  coin: number;
  territory: number;
  legions: number;
  expansionPending: { until: number; targetN: number } | null;
  p1Unlocked: boolean;
  legacyPoints: number;
  tradeRoutes: TradeRoute[];
  reputation: number;
  tradeNotes: string[];
  // ── E5 远洋时代 ──
  paper: number;
  books: number;
  silver: number;
  researchPoints: number;
  exoticGoods: number;
  literacy: number;
  voyages: Voyage[];
  loan: number;
  /** E5 本 tick 的印刷链瓶颈文案（供 UI 直接显示，无瓶颈时为空串） */
  printNote: string;
  /** E5 本 tick 的远航事件消息 */
  voyageNotes: string[];

  // ── E6 机器时代 ──
  coal: number;
  steel: number;
  electricity: number;
  industrial: number;
  steamPressure: number;
  pollution: number;
  urbanizationRate: number;
  /**
   * E6 本 tick 的能量链快照（不存档）。
   *
   * 刻意把整个运行时对象带出来而不是拆成十几个字段：UI 的能量链面板
   * 需要**同时**显示各环 η 与 G/D/ρ，分开取值会出现"不同帧拼在一起"的
   * 显示不一致（同 E3 贸易排序的历史教训）。
   */
  energy: EnergyRuntime;
  /** E6 本 tick 的电网惩罚（供 UI 暗角/脉冲判定） */
  grid: { outputMul: number; brownout: boolean; blackout: boolean };
  /** E6 本 tick 的蒸汽压力档位 */
  pressureTier: { key: 'idle' | 'low' | 'normal' | 'high'; label: string; color: string };
  /** E6 本 tick 的能源/城市化消息（掉档、拉闸、污染告警） */
  energyNotes: string[];
}

export function tick(
  state: E1State,
  dt: number,
  rng: () => number = Math.random,
  nowSec = Date.now() / 1000
): TickResult {
  const eff = aggregateEffects(state);

  // 本时代已经过的秒数——季节循环的驱动源
  const eraElapsedSec = (state.eraElapsedSec ?? 0) + dt;

  // 1) 产出
  const foodGain = calcResourceOutput('food', state) * dt;
  const woodGain = calcResourceOutput('wood', state) * dt;
  const stoneGain = calcResourceOutput('stone', state) * dt;
  const expGain = calcExperienceOutput(state) * dt;

  let wood = Math.min(state.wood + woodGain, getResourceStorage('wood', state));
  let stone = Math.min(state.stone + stoneGain, getResourceStorage('stone', state));
  // E6 起知识会在 tick 末追加（calcKnowledgeOutputE6），故此处必须是 let。
  let experience = state.experience + expGain;

  // 2) 火种（自动维持消耗木材）
  const fireResult = tickFire({ ...state, wood }, dt);
  wood = fireResult.wood;
  const fire = fireResult.fire;

  // 3) 人口：**整数增长**
  //
  // 为什么不能直接保留小数人口：
  //   逻辑斯蒂曲线是渐近逼近上限的（P 越接近 K 增长越慢），
  //   人口会永远停在 K−ε（实测 K=4 时停在 3.9999…）。
  //   而岗位分配用 Math.floor(人口) 计算可分配数，于是满员时
  //   最后一个位置永远排不上人 —— 这是玩家能直接感知的 bug。
  //
  // 方案：人口保持整数，小数增长累积进 populationProgress，满 1 才 +1 人。
  const K = getCapacity(state);
  const growth = getPopulationGrowth(state);
  // Math.floor 兜底：旧存档可能存了小数人口（修复前遗留），
  // 这里强制归整，保证人口始终是整数
  const populationStep = advancePopulation({
    population: state.population,
    progress: state.populationProgress ?? 0,
    capacity: K,
    growthPerSec: growth,
    dt,
  });
  let population = populationStep.population;
  let progress = populationStep.progress;

  // ── 3.5) 吃粮：单一「食物」池 ──
  //
  // 2026-09-12 用户拍板：**暂时不区分**采集所得与农耕收获，统一为「食物」
  // （原独立的「谷物」资源已合并进来，见 data/resources.ts）。
  //
  // 于是这里是唯一的吃粮路径：
  //   食物 = 现值 + 产出（采集/狩猎/农耕同源） − 人口消耗 − 牲畜饲料
  // 定居时代人口更集中，人均消耗取 E2.FOOD_PER_PERSON_SEC（0.25/秒），
  // E1 仍是 0.2/秒 —— E1 逐字节不变。
  const popPerSec = eff.seasonsEnabled
    ? E2.FOOD_PER_PERSON_SEC
    : POPULATION.FOOD_CONSUMPTION_PER_PERSON;

  let food = state.food + foodGain - population * popPerSec * dt;

  // ─────────────────────────────────────────────
  // 4) E2 定居时代：牲畜 / 织物
  // ─────────────────────────────────────────────
  //
  // 食物有**硬容量**（E1 由储存技术决定，E2 再加粮仓体系）——
  // 这是「秋天必须攒够」这个核心玩法的落地点：产出集中在秋季，
  // 但仓库装不下就只能眼看着烂掉。
  let livestock = state.livestock ?? 0;
  let fabric = state.fabric ?? 0;

  if (eff.seasonsEnabled) {
    const livestockGain = calcResourceOutput('livestock', state) * dt;
    const fabricGain = calcResourceOutput('fabric', state) * dt;

    // 牲畜先按畜栏存栏上限封顶（畜栏 = 活体库存的"仓库"）
    const pens = state.buildings.animal_pen ?? 0;
    const penCap = pens * (E2.PEN_CAPACITY + eff.penCapacityAdd);
    livestock = Math.min(livestock + livestockGain, penCap);

    // 牲畜吃饲料（「畜力与厩肥」可降饲料成本）
    food -= livestock * E2.FEED_PER_LIVESTOCK_SEC * eff.feedCostMultiplier * dt;

    // 食物见底 → 牲畜闹饥荒。
    // 默认（无兽医知识）存活率为 0，即"饥荒牲畜死亡率 100%"；
    // 「兽医知识」把它提到 50%。注意这里只损失牲畜，不损失人口与科技。
    if (food < 0) {
      const loss = 1 - eff.livestockFamineSurvival;
      if (loss > 0) livestock = Math.max(0, livestock * (1 - loss));
    }

    fabric = Math.max(0, fabric + fabricGain);
  }

  food = Math.max(0, Math.min(food, getResourceStorage('food', state)));

  // ─────────────────────────────────────────────
  // 5) E3 城邦时代：铜锡青铜链 + 贸易
  // ─────────────────────────────────────────────
  //
  // 执行顺序（devplan §7.3）：资源产出 → 消耗 → **贸易** → 人口增长。
  // 贸易换回的粮食必须计入本 tick 的食物池**之后**再结算人口——
  // 否则"粮食断供 → 贸易救回来"会晚一拍体现（E2 踩过顺序失真的坑）。
  //
  // 但注意：E3 的人口增长已在本函数上方用「tick 前的 state」算完，
  // 此处只在末尾返回增量。真正的顺序约束体现在 store 的 doTick 里
  // （先 tick 资源含贸易 → 再调人口）。这里只负责算 E3 资源增量。
  let copper = state.copper ?? 0;
  let tin = state.tin ?? 0;
  let bronze = state.bronze ?? 0;
  let lapis = state.lapis ?? 0;
  let iron = state.iron ?? 0;
  let coin = state.coin ?? 0;
  let territory = Math.max(1, state.territory ?? 1);
  const legions = state.jobs.legion ?? state.legions ?? 0;
  let expansionPending = state.expansionPending ?? null;
  const p1Unlocked = state.p1Unlocked ?? false;
  const legacyPoints = state.legacyPoints ?? 0;
  let tradeRoutes = state.tradeRoutes ?? [];
  let reputation = state.reputation ?? 50;
  const tradeNotes: string[] = [];

  if (state.era === 'E4') {
    const ironGain = calcResourceOutput('iron', state) * dt;
    iron = Math.min(iron + ironGain, getResourceStorage('iron', state));
    // 铸币应能消费本 tick 刚开采的铁，避免铁矿工与铸币工首次同时上岗时
    // 出现一拍的假性停产；仍由 calcResourceOutput 按库存比例限制实际铸币量。
    const coinGain = calcResourceOutput('coin', { ...state, iron }) * dt;
    coin = Math.min(coin + coinGain, getResourceStorage('coin', state));
    // 铸币不是凭空生成：按实际产出的铸币量消耗铁，缺铁时产出已按比例降速。
    iron = Math.max(0, iron - coinGain * E4.MINT_IRON_PER_COIN);

    const foodUpkeep = legions * E4.LEGION_FOOD_PER_SEC * dt;
    const coinUpkeep = getCoinSpendPerSec(state) * dt;
    food = Math.max(0, food - foodUpkeep);
    const coinBeforeUpkeep = coin;
    coin = Math.max(0, coin - coinUpkeep);
    const unpaid = Math.max(0, coinUpkeep - coinBeforeUpkeep);
    if (unpaid > 0) tradeNotes.push('铸币不足 —— 军团欠饷');

    if (expansionPending && eraElapsedSec >= expansionPending.until) {
      territory = Math.max(territory, Math.min(E4.MAX_TERRITORY, expansionPending.targetN));
      expansionPending = null;
    }

  }


  if (state.era === 'E3') {
    // 5a) 铜/锡/青铜产出
    // 矿工产出由科技驱动（铜矿开采→铜、锡矿开采→锡），口径统一在
    // calcResourceOutput 的 E3 段，这里只写回；冶炼消耗在 5b 段扣除，
    // 净速率由 getNetResourceRate 提供给 UI。
    copper += calcResourceOutput('copper', state) * dt;
    tin += calcResourceOutput('tin', state) * dt;

    // 5b) 冶炼：每名冶炼工需 0.045 铜 + 0.005 锡，产出 0.05 青铜/秒（×熔炉加成）
    //     缺料按比例降速（"缺料停工"而不是报错）
    const smelters = state.jobs.smelter ?? 0;
    if (smelters > 0 && state.techs.bronze_smelting) {
      const needCopper = smelters * E3.SMELT_COPPER_IN * dt;
      const needTin = smelters * E3.SMELT_TIN_IN * dt;
      const copperRatio = needCopper > 0 ? Math.min(1, copper / needCopper) : 1;
      const tinRatio = needTin > 0 ? Math.min(1, tin / needTin) : 1;
      const ratio = Math.min(copperRatio, tinRatio);
      if (ratio > 0) {
        copper -= needCopper * ratio;
        tin -= needTin * ratio;
        const furnaceBonus = 1 + (state.buildings.furnace ?? 0) * E3.FURNACE_BONUS;
        bronze += smelters * E3.SMELT_BRONZE_OUT * ratio * furnaceBonus * dt;
      } else if (tin <= 0) {
        tradeNotes.push('缺锡 —— 需与迪尔蒙建立贸易路线');
      } else if (copper <= 0) {
        tradeNotes.push('缺铜 —— 需开矿或与埃兰/玛甘贸易');
      }
    }

    // 5c) 贸易结算（30 秒一轮，按需补跑——dt 通常为 0.25s，用累积器）
    //     简单实现：每周期检查一次（cycleAccum 累积到 CYCLE_SEC 则结算）
    const cycleSec = E3.TRADE_CYCLE_SEC;
    let needCycle = false;
    for (const r of tradeRoutes) {
      if (r.cycleAccum >= cycleSec) { needCycle = true; break; }
    }
    if (needCycle && tradeRoutes.length > 0) {
      const result = settleTradeCycle(state, cycleSec, rng, nowSec);
      // 应用货物增量（付出侧做库存下限保护，不透支为负）
      const apply = (res: string, amount: number) => {
        switch (res) {
          case 'copper': copper = Math.max(0, copper + amount); break;
          case 'tin': tin = Math.max(0, tin + amount); break;
          case 'bronze': bronze = Math.max(0, bronze + amount); break;
          case 'food': food = Math.max(0, food + amount); break;
          case 'wood': wood = Math.max(0, wood + amount); break;
          case 'stone': stone = Math.max(0, stone + amount); break;
          case 'lapis': lapis = Math.max(0, lapis + amount); break;
        }
      };
      for (const [res, amount] of Object.entries(result.delta)) {
        if (amount === undefined) continue;
        apply(res, amount);
      }
      tradeRoutes = result.routes;
      tradeNotes.push(...result.notes);
      // 重置周期计时：结算完成的路线**归零**。
      //
      // ⚠️ 曾是 E3 最大恶性 bug（2026-09-12 定位）：settleTradeCycle 内部对每条
      // 路线 `cycleAccum += cycleSec`，此处若只 `-= cycleSec`，净变化为 0——
      // 累积值停在 ≥30 永远满足结算条件，此后**每个 tick（0.25s）都重复结算**
      // （应每 30s 一次），每 tick 掏走全额运力（数百单位支付货物），
      // 木材/食物产出被瞬间抽干 → 一切建设停摆。
      tradeRoutes = tradeRoutes.map(r => ({ ...r, cycleAccum: 0 }));
    } else {
      // 未到周期：推进计时
      tradeRoutes = tradeRoutes.map(r => ({ ...r, cycleAccum: r.cycleAccum + dt }));
    }
  }

  // ─────────────────────────────────────────────
  // 5.5) E5 远洋时代
  // ─────────────────────────────────────────────
  //
  // 严格按 E5-devplan §3.3 的 tick 顺序：
  //   印刷链产出 → 典籍被读掉（消耗）→ 识字率 → 远航结算 → ★复利研究点 → 银行
  //
  // ⚠️ 整块被 `state.era === 'E5'` 门控。E1–E4 走不进这里，
  //    因此 1163s / 1920s 基线不受任何影响 —— 这是本块最重要的正确性约束。
  let paper = state.paper ?? 0;
  let books = state.books ?? 0;
  let silver = state.silver ?? 0;
  let researchPoints = state.researchPoints ?? 0;
  let exoticGoods = state.exoticGoods ?? 0;
  let literacy = state.literacy ?? E5.LITERACY_START;
  let voyages = state.voyages ?? [];
  let loan = state.loan ?? 0;
  let printNote = '';
  const voyageNotes: string[] = [];

  if (state.era === 'E5') {
    // ── 1) 印刷链产出（含输入约束）──
    const chain = calcPrintChain(
      {
        era: state.era,
        wood,
        paper,
        books,
        jobs: state.jobs,
        buildings: state.buildings,
      },
      {
        paperOutputMul: eff.paperOutputMul,
        printOutputMul: eff.printOutputMul,
        researchOutputMul: eff.researchOutputMul,
      }
    );

    // 造纸工先吃木
    wood = Math.max(0, wood - chain.woodConsumed * dt);
    paper += chain.paperRate * dt;
    books += chain.bookRate * dt;
    // 典籍被学者读掉 —— 这是**消耗**，不是转化
    books = Math.max(0, books - chain.booksConsumed * dt);

    printNote = chain.bottleneck === 'none' ? '' : describeBottleneck(chain.bottleneck);

    // ── 2) 识字率（逻辑斯谛，受印刷产能与教师驱动）──
    const teachers = state.jobs.teacher ?? 0;
    const universities = state.buildings.university ?? 0;
    literacy = tickLiteracy(
      literacy,
      dt,
      chain.bookRate,
      teachers,
      universities,
      eff.literacyCapAdd
    );

    // ── 3) 远航结算 ──
    //
    // 进度 = 水手 × 1.0/秒 × (1 + 科技加成 + 识字率加成)
    // 每支船队占用水手；到 target 就结算一次事件并**重新开始航程**
    // （船队不会消失：远航是持续投入，不是一次性抽卡）。
    if (eff.voyageEnabled && voyages.length > 0) {
      const lit01 = literacy / 100;
      const sailorsPerVoyage = E5.VOYAGE_PROGRESS_PER_SAILOR > 0 ? 1 : 1;
      void sailorsPerVoyage;
      const totalSailors = state.jobs.sailor ?? 0;
      // 水手在船队间均分：3 支船队、30 水手 → 每支 10 人
      const perVoyage = voyages.length > 0 ? totalSailors / voyages.length : 0;

      const next: Voyage[] = [];
      for (const v of voyages) {
        const stepped = advanceVoyage(
          { ring: v.ring, progress: v.progress, target: v.target, newWorldFound: v.newWorldFound },
          dt,
          perVoyage,
          eff.voyageBonus,
          lit01
        );

        if (!stepped.completed) {
          next.push({ ...v, progress: stepped.progress });
          continue;
        }

        // 到岸：结算事件
        const outcome = rollVoyageEvent(v.ring, rng);

        // 首次完成第 2 环 → 强制「发现新大陆」（全局一次性）
        const isFirstNewWorld = v.ring === 2 && outcome.newWorld === true && !v.newWorldFound;

        if (outcome.reward.silver) silver += outcome.reward.silver;
        if (outcome.reward.exoticGoods) exoticGoods += outcome.reward.exoticGoods;
        if (outcome.reward.researchPoints) researchPoints += outcome.reward.researchPoints;
        if (outcome.refundRatio) {
          // 沉船：按比例返还本次出航的白银成本
          silver += (E5.VOYAGE_COST[v.ring].silver ?? 0) * outcome.refundRatio;
        }

        if (isFirstNewWorld) {
          const rw = E5.NEW_WORLD_REWARD;
          exoticGoods += rw.exoticGoods;
          silver += rw.silver;
          researchPoints += rw.researchPoints;
          voyageNotes.push(`🌍 发现新大陆！异域物产 +${rw.exoticGoods}，白银 +${rw.silver}，研究点 +${rw.researchPoints}`);
        } else {
          voyageNotes.push(`${ringName(v.ring)}航程结算：${outcome.label}`);
        }

        // 重新出海：进度归零，保留新大陆标记
        next.push({
          ...v,
          progress: 0,
          newWorldFound: v.newWorldFound || isFirstNewWorld,
        });
      }
      voyages = next;
    }

    // ── 4) ★ 复利研究点产出（R 在此现算，绝不缓存）──
    //
    // 顺序很重要：本 tick 刚解锁的科技**立刻**影响本 tick 的产出，
    // 这就是"研究完一项，下一 tick 变快"的手感来源。
    const R = getCompoundMultiplier(state, { compoundKAdd: eff.compoundKAdd });
    const litFactor = getLiteracyFactor(literacy / 100);

    // 学者产出研究点。设计文档 §11.2：
    //     研究速度 = 印刷产能 B × 复利倍率 R(N) × 识字率因子
    //
    // ⚠️ 这里必须是**完整相乘**，不能只加增量。
    //    曾经写成 `researchPoints += base × (R−1)` + `base × (litFactor−1)`——
    //    结果 R=1、litFactor<1 时研究点是**负数**（识字率 12% → 因子 0.772），
    //    而 baseline（无科技、识字率不足）时学者完全不产出。都是错的。
    //    `chain.researchRate` 本身已含输入约束（缺典籍时自动降速），
    //    所以三个因子直接连乘即可，不需要额外裁剪。
    const baseResearch = chain.researchRate;
    researchPoints += baseResearch * R * litFactor * dt;

    // ── 5) 银行利息 ──
    if (eff.bankEnabled && loan > 0) {
      loan = tickBank(loan, dt);
    }

    // ── 6) 库存上限（典籍/纸张是 E5 的存储瓶颈）──
    const bookCap = getBookStorage(state, eff.bookCapacityAdd);
    books = Math.max(0, Math.min(books, bookCap));
    paper = Math.max(0, Math.min(paper, getPaperStorage(0)));
  }

  // ─────────────────────────────────────────────
  // 5.6) E6 机器时代
  // ─────────────────────────────────────────────
  //
  // 严格按 E6-devplan §3.3 的 tick 顺序：
  //   煤/钢产出 → 能量链 → 工厂产出 → 蒸汽压力 → 污染 → 人口
  //
  // ⚠️ 整块被 `state.era === 'E6'` 门控。E1–E5 走不进这里，
  //    因此 1163s / 1920s 基线与 E5 的全部数值不受任何影响 ——
  //    这是本块最重要的正确性约束（devplan §一 的铁律）。
  //
  // ⚠️ 顺序不可调换：能量链（步骤 2）必须排在工厂产出（步骤 3）之前，
  //    否则工厂会用上一帧的陈旧供给率；污染（步骤 5）必须排在人口（步骤 6）
  //    之前，否则"治理后人口回升"会晚一拍，玩家误以为治理无效。
  let coal = state.coal ?? 0;
  let steel = state.steel ?? 0;
  let electricity = state.electricity ?? 0;
  let industrial = state.industrial ?? 0;
  let steamPressure = state.steamPressure ?? 0;
  let pollution = state.pollution ?? 0;
  let urbanizationRate = state.urbanizationRate ?? 0;
  let railroadLevel = state.railroadLevel ?? 0;
  let energyRt: EnergyRuntime = emptyEnergyRuntime();
  let energyNotes: string[] = [];

  if (state.era === 'E6') {
    // ── 1) 煤 / 钢产出 ──
    //
    // 煤矿工：0.6 煤/人/秒，每座煤矿 +25%。
    // 炼钢工：0.15 钢/人/秒，每产 1 钢耗 0.8 煤/秒。
    //
    // ⚠️ 炼钢与锅炉**争夺同一批煤**，这就是设计上第一个瓶颈（煤荒）。
    //    两者相加超过煤产量时，这里按比例分配：先保证锅炉（否则全厂停摆），
    //    余下的才给炼钢。玩家看到的症状是"钢厂建了却不出钢"。
    const coalMiners = state.jobs.coal_miner ?? 0;
    const coalMines = state.buildings.coal_mine ?? 0;
    const coalGain = coalMiners * 0.6 * (1 + 0.25 * coalMines) * dt;

    const steelWorkers = state.jobs.steelworker ?? 0;
    const steelGain = steelWorkers * 0.15 * dt;
    const steelCoalNeed = steelWorkers * 0.8 * dt;

    coal += coalGain;

    // ── 2) 能量链推进（含烧煤）──
    //
    // E6 效率参数从 aggregateEffects 注入：energy.ts 刻意不反向 import
    // engine（会形成循环依赖），故本模块负责把聚合结果递过去。
    const e6fx = {
      boilerEtaAdd: eff.boilerEtaAdd,
      steamGenMul: eff.steamGenMul,
      scaleSlopeAdd: eff.scaleSlopeAdd,
      factoryOutMul: eff.factoryOutMul,
      railroadBonusMul: eff.railroadBonusMul,
    };
    const e6ux = {
      pollutionReduce: eff.pollutionReduce,
      crowdingReduce: eff.crowdingReduce,
      knowledgePerPopAdd: eff.knowledgePerPopAdd,
    };

    energyRt = calcSupply({ ...state, coal } as E1State, e6fx);

    // 锅炉取煤。
    //
    // ⚠️ 取的是 min(能力, 需求) 而非纯能力：
    //    压力封顶后若继续满负荷烧煤，煤会被白白烧光，炼钢永远分不到煤，
    //    于是"钢 ≥ 200000"这条跃迁条件永远无法满足
    //    （e6-autoplay 实测：煤 0↔10000 振荡、钢恒为 0）。
    //    getCoalDemand 给出"维持满压所需"的经济上限，余量留给炼钢。
    const boilerDemand = getCoalDemand({ ...state, coal } as E1State, e6fx);
    const boilerBurn = Math.min(energyRt.coalBurned, boilerDemand);
    const boilerCoal = Math.min(coal, boilerBurn * dt);
    coal = Math.max(0, coal - boilerCoal);

    // ── 3) 工厂产出 ──
    //
    // ⚠️ 工厂产出必须用**扣完锅炉煤之后**的状态重算供给率，
    //    否则会出现"煤已经烧掉但工厂仍按有煤满负荷生产"的账目错误。
    //
    // 同时要重算烧煤量：锅炉已按"需求"取煤，机械能必须按**实际烧掉的煤**
    // 计算，否则会凭空多出 (能力−需求) 那部分机械能 —— 那等于免费能源，
    // 会让电网 ρ 虚高、工厂产出虚增。
    const rtAfterCoal = calcSupply({ ...state, coal } as E1State, e6fx);
    // 用实际烧煤量重算毛机械能（保持与扣煤账目一致）
    const actualBurn = Math.min(rtAfterCoal.coalBurned, boilerDemand);
    const eta1Now = getBoilerEta(e6fx);
    const eta2Now = getSteamEta2Effective({ ...state, steamPressure } as E1State, e6fx);
    const mechRawActual = actualBurn * E6.COAL_KW_PER_UNIT * eta1Now * eta2Now;
    // 按实际/能力的比例缩放供给（电气与直驱两条路径同源缩放）。
    //
    // ⚠️ mechRaw === 0 时必须直接给 0，不能走除法：
    //    0/0 = NaN，而 NaN 会顺着 mechSupply → supplyRate → 工厂产出
    //    一路污染成 industrial = NaN，并在 UI 上显示成 "NaN"。
    //    实测：未研究「纽科门机」时 eta2=0 → mechRaw=0 → 立刻 NaN。
    const scaleRatio =
      rtAfterCoal.mechRaw > 0 ? mechRawActual / rtAfterCoal.mechRaw : 0;
    const mechSupplyScaled = rtAfterCoal.mechSupply * scaleRatio;
    const gridGScaled = rtAfterCoal.gridG * scaleRatio;
    energyRt = {
      ...rtAfterCoal,
      coalBurned: actualBurn,
      mechRaw: mechRawActual,
      mechSupply: mechSupplyScaled,
      gridG: gridGScaled,
      rho: rtAfterCoal.gridD > 0
        ? Math.min(1, gridGScaled / rtAfterCoal.gridD)
        : 1,
      supplyRate:
        (state.buildings.factory ?? 0) > 0
          ? Math.min(
              1,
              mechSupplyScaled / ((state.buildings.factory ?? 0) * E6.FACTORY_MECH_KW)
            )
          : 0,
      coalConsumed: actualBurn,
    };

    const factoryOut = calcFactoryOutputFromRuntime(
      { ...state, coal } as E1State,
      energyRt,
      e6fx
    );
    industrial += factoryOut * dt;

    // 炼钢：先看剩多少煤
    if (steelWorkers > 0) {
      const coalForSteel = Math.min(coal, steelCoalNeed);
      const ratio = steelCoalNeed > 0 ? coalForSteel / steelCoalNeed : 0;
      coal = Math.max(0, coal - coalForSteel);
      steel += steelGain * ratio;
      if (ratio < 0.99 && steelWorkers > 0) {
        energyNotes.push('⚠️ 煤不足，炼钢降速——锅炉与钢厂在争同一批煤');
      }
    }

    // ── 4) 蒸汽压力 ──
    const steam = tickSteam(steamPressure, { ...state, coal } as E1State, dt);
    steamPressure = steam.pressure;

    // 掉档告警（仅在有工厂时提示，避免开局噪音）。
    // ⚠️ 这里必须用 energy.isPressureSufficient 的口径，即"压力是否够当前世代"，
    //    而不是"压力是否满"——世代 I 只需 1 点压力，满档提示会全程误报。
    const factoriesNow = state.buildings.factory ?? 0;
    if (factoriesNow > 0 && !isPressureSufficient({ ...state, steamPressure } as E1State)) {
      energyNotes.push('🔥 蒸汽压力不足当档，蒸汽机喘振（效率 ×0.4）——派更多司炉工');
    }

    // ── 5) 污染累积 ──
    const pol = tickPollution(pollution, state, dt, e6ux);
    pollution = pol.pollution;

    // ── 6) 城市化率（由住宅承载推导，单一来源）──
    urbanizationRate = getUrbanizationRate(state);

    // ── 7) 电网惩罚告警 ──
    const throttle = applyGridThrottle(energyRt.rho);
    if (throttle.blackout) {
      energyNotes.push('⚡ 电网崩溃！ρ < 0.2，工厂降至 30% 产出——立刻加建发电厂');
    } else if (throttle.brownout) {
      energyNotes.push('⚡ 电网拉闸：ρ < 0.6，人口增长额外 −30%');
    }

    // ── 8) 知识产出（E6 沿用「知识/研究点」货币）──
    //
    // E6 的知识产出挂在人口上（而非像 E5 那样挂在印刷链上）：
    // 工业化国家的知识来自普及教育，不再是少数抄书人。
    const knowledgeOut = calcKnowledgeOutputE6(state, e6ux);
    experience += knowledgeOut * dt;

    // 铁路等级由科技与工业品解锁（三级工程系统）
    if (state.techs['railroad'] && railroadLevel === 0) railroadLevel = 1;
  }

  const energyGrid = applyGridThrottle(energyRt.rho);
  const energyTier = getPressureTier(steamPressure);

  // E4 资源也必须在 tick 末统一应用库存上限，避免产出层与资源栏显示脱节。
  if (state.era === 'E4') {
    iron = Math.max(0, Math.min(iron, getResourceStorage('iron', state)));
    coin = Math.max(0, Math.min(coin, getResourceStorage('coin', state)));
  }

  // E3 资源仓储上限（food/wood/stone 与铜锡青铜共用 GetCapacity 体系）
  if (state.era === 'E3') {
    food = Math.max(0, Math.min(food, getResourceStorage('food', state)));
    wood = Math.max(0, Math.min(wood, getResourceStorage('wood', state)));
    stone = Math.max(0, Math.min(stone, getResourceStorage('stone', state)));
    copper = Math.max(0, Math.min(copper, getResourceStorage('copper', state)));
    tin = Math.max(0, Math.min(tin, getResourceStorage('tin', state)));
    bronze = Math.max(0, Math.min(bronze, getResourceStorage('bronze', state)));
  }

  return {
    food,
    wood,
    stone,
    experience,
    population,
    populationProgress: progress,
    fire,
    livestock,
    fabric,
    eraElapsedSec,
    copper,
    tin,
    bronze,
    lapis,
    iron,
    coin,
    territory,
    legions,
    expansionPending,
    p1Unlocked,
    legacyPoints,
    tradeRoutes,
    reputation,
    tradeNotes,
    // ── E5 远洋时代 ──
    paper,
    books,
    silver,
    researchPoints,
    exoticGoods,
    literacy,
    voyages,
    loan,
    printNote,
    voyageNotes,
    // ── E6 机器时代 ──
    coal,
    steel,
    electricity,
    industrial,
    steamPressure,
    pollution,
    urbanizationRate,
    energy: energyRt,
    grid: energyGrid,
    pressureTier: energyTier,
    energyNotes,
  };
}

export { JOBS, TECHS, TECH_MAP, BUILDING_MAP };
export type { JobId, BuildingId, ResourceId };
