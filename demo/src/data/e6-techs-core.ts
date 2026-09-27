import type { TechDef } from './techs';

/**
 * E6 核心 + 支撑（1 核心 + 8 支撑）。
 *
 * 核心科技是**蒸汽机（工业应用）**——注意它与 E5 门槛科技「蒸汽机」（id `steam_engine`）
 * 是**同一台机器的两次研究**，花费不重复：
 *   E5 的蒸汽机是「抽水样机」（纽科门式，证明"火能做功"）；
 *   E6 的蒸汽机是「工业动力源」（把它接上传动轴、带得动一整座工厂）。
 * 设计上把这两步拆开，是为了让 E6 的开局有"我认识这东西，但我得重新驯服它"的实感。
 *
 * 支撑 8 项各开一条支路（煤 / 蒸汽世代 / 炼钢 / 电气 / 铁路 / 彩蛋）。
 * 其中「分析机」是原定的 E6 门槛，2026-09-12 修订后**降级为支撑彩蛋**，
 * 指向 E8 信息时代——它的 requires 刻意挂在一条不阻塞门槛的收尾位置，
 * 成本标 TODO(balance)（devplan §4.4）。
 */
export const E6_TECHS_CORE: TechDef[] = [
  // ── 核心 ──
  {
    id: 'steam_engine_industry', name: '蒸汽机（工业应用）', short: '工业蒸汽', icon: '⚙️', branch: 'core', era: 'E6', cost: 250000, type: 'unlock',
    requires: ['steam_engine'],
    effects: { enableEnergyChain: true, unlockJobs: ['stoker', 'machinist'], unlockBuildings: ['boiler_house', 'steam_engine_house', 'factory', 'worker_housing'] },
    position: { x: 0, y: 0 },
    desc: '让蒸汽机脱离矿井、接上传动轴。**能量链系统由此解锁**——本代的一切都从这条链上长出来。',
  },

  // ── 支撑 8：各开一条支路 ──
  {
    id: 'coal_mining', name: '采煤工业', short: '采煤', icon: '⛏️', branch: 'efficiency', era: 'E6', cost: 400000, type: 'unlock',
    requires: ['steam_engine_industry'],
    effects: { unlockJobs: ['coal_miner'], unlockBuildings: ['coal_mine'] },
    position: { x: -3, y: 1 },
    desc: '把煤从"偶尔捡到的黑石头"变成成规模的工业原料。能量链的第一环。',
  },
  {
    id: 'newcomen', name: '纽科门机', short: '纽科门', icon: '🕳️', branch: 'efficiency', era: 'E6', cost: 600000, type: 'unlock',
    requires: ['steam_engine_industry'],
    effects: { steamGenTier: 'I' },
    position: { x: -3, y: 2 },
    desc: '大气式蒸汽机：热效率仅 2%，但它是**世代 I 的入场券**——没有它，能量链根本转不起来。',
  },
  {
    id: 'smeaton', name: '斯米顿改良', short: '斯米顿', icon: '🔧', branch: 'efficiency', era: 'E6', cost: 700000, type: 'numeric',
    requires: ['newcomen'],
    effects: { steamGenTier: 'I5' },
    position: { x: -3, y: 3 },
    desc: '系统试验各部件尺寸，效率从 2% 提到 4.5%——**一次改进就翻倍**。本代效率科技的高回报从这里开始。',
  },
  {
    id: 'separate_condenser', name: '分离冷凝器', short: '冷凝器', icon: '💧', branch: 'efficiency', era: 'E6', cost: 1000000, type: 'qualitative',
    requires: ['smeaton'],
    effects: { steamGenTier: 'III' },
    position: { x: -1, y: 4 },
    desc: '瓦特的关键洞察：汽缸不必反复冷却。效率跳到 9%，蒸汽机从此真正成为动力源。',
  },
  {
    id: 'reciprocating_engine', name: '回转式蒸汽机', short: '回转', icon: '🔄', branch: 'efficiency', era: 'E6', cost: 1500000, type: 'qualitative',
    requires: ['separate_condenser'],
    effects: { scaleSlopeAdd: 0.05 },
    position: { x: -1, y: 5 },
    desc: '把往复运动变成旋转——机器终于能带动轮轴而非只抽水。工厂规模效应的斜率提升。',
  },
  {
    id: 'bessemer', name: '贝塞麦炼钢法', short: '炼钢', icon: '🔩', branch: 'efficiency', era: 'E6', cost: 2000000, type: 'unlock',
    requires: ['steam_engine_industry'],
    effects: { unlockJobs: ['steelworker'] },
    position: { x: 2, y: 2 },
    desc: '转炉吹氧，钢从"贵金属"变成"建材"。工业化的一切结构件都靠它。',
  },
  {
    id: 'electromagnetic_induction', name: '电磁感应·发电机', short: '发电机', icon: '🔌', branch: 'efficiency', era: 'E6', cost: 2600000, type: 'unlock',
    requires: ['bessemer'],
    effects: { unlockJobs: ['electrician'], unlockBuildings: ['power_plant'], enableGrid: true },
    position: { x: 2, y: 3 },
    desc: '法拉第的线圈：机械能可以变成电。**电气化路径由此打开**——它比直驱多两道损耗，却能摆脱传动轴的摩擦瓶颈。',
  },
  {
    id: 'railroad', name: '铁路', short: '铁路', icon: '🛤️', branch: 'efficiency', era: 'E6', cost: 3200000, type: 'unlock',
    requires: ['bessemer'],
    effects: { enableRailroad: true },
    position: { x: 4, y: 3 },
    desc: '钢轨上的运输革命：运力 +10%，并降低运输损耗。三级工程系统的起点。',
  },
  {
    id: 'analytical_engine', name: '分析机', short: '分析机', icon: '🧮', branch: 'efficiency', era: 'E6', cost: 5000000, type: 'qualitative',
    requires: ['railroad'],
    effects: { knowledgePerPopAdd: 0.05 },
    position: { x: 4, y: 6 },
    // ⚠️ 彩蛋科技：原为门槛，2026-09-12 降级为支撑（指 E8 信息时代）。
    //    它挂在铁路之后 —— 不阻塞「电力」门槛，也不影响跃迁六项条件。
    desc: '巴贝奇的齿轮计算机：从未真正建成，却指向了一个世纪后的世界。**收尾彩蛋 → E8 信息时代**。',
  },
];
