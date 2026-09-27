import type { TechDef } from './techs';

/**
 * E6 效率（14 项）。
 *
 * 本代的设计重点是**转化效率**而非产能扩张：能量链每加一环就多一次 η 乘法打折，
 * 所以「把 η₂ 从 2% 提到 22%」比「多建十座工厂」值钱得多。
 * 这 14 项因此分成四组：
 *
 *   蒸汽世代 4（斯米顿/调速器/高压/复式）—— 提升 η₂，收益最大
 *   锅炉与冷凝 2（焦炭/表面冷凝）—— 提升 η₁ 与稳定性
 *   输电 3（直流/交流/高压交流）—— 提升 η₄，决定电气化是否划算
 *   生产组织 2（标准化零件/流水线）—— 提升规模效应斜率
 *   城市治理 2（公共卫生法/城市排水）—— 唯一的**负向因子解药**（污染）
 *   铁路 1（钢轨）—— 提升铁路工程收益
 *
 * ⚠️ 城市治理这两项不是可选项：E6 的城市化会把 r 拖到 0.0074 一带形成死亡螺旋，
 *    没有这两项玩家会被自己的城市压死（见 E6-machine.md §4.4）。
 */
export const E6_TECHS_EFF: TechDef[] = [
  // ── 锅炉与燃料 ──
  {
    id: 'coke_smelting', name: '焦炭冶炼', short: '焦炭', icon: '🪨', branch: 'efficiency', era: 'E6', cost: 400000, type: 'numeric',
    requires: ['coal_mining'],
    effects: { boilerEtaAdd: 0.045 },
    position: { x: -5, y: 3 },
    desc: '把煤炼成焦炭再烧：烟少、温高、η₁ 从 45% 提到 49.5%。能量链**第一环**的效率。',
  },
  {
    id: 'surface_condenser', name: '表面冷凝器', short: '表面冷凝', icon: '🧊', branch: 'efficiency', era: 'E6', cost: 2400000, type: 'numeric',
    requires: ['reciprocating_engine'],
    effects: { steamGenMul: 1.08, pollutionReduce: 0.05 },
    position: { x: -1, y: 6 },
    desc: '闭式循环减少补水中断，蒸汽世代效率 +8%，并略降污染——工业化与城市终于能谈和。',
  },

  // ── 蒸汽调速与高压 ──
  {
    id: 'governor', name: '调速器', short: '调速器', icon: '🎛️', branch: 'efficiency', era: 'E6', cost: 1000000, type: 'qualitative',
    requires: ['smeaton'],
    effects: { steamGenMul: 1.06 },
    position: { x: -5, y: 4 },
    desc: '离心调速让机器自己稳住转速——蒸汽压力不再靠人盯着。世代效率 +6%。',
  },
  {
    id: 'high_pressure', name: '高压蒸汽机', short: '高压', icon: '🌡️', branch: 'efficiency', era: 'E6', cost: 1600000, type: 'qualitative',
    requires: ['separate_condenser'],
    effects: { steamGenTier: 'IV' },
    // ⚠️ 世代 IV（22%）是能量链上最陡的一跳：从 III 的 9% 直接翻到 22%。
    //    代价是它要求「高压档位」（≥67），压力表掉档就喘振 ×0.4 —— 高回报高维护。
    position: { x: -5, y: 5 },
    desc: '更高压力、更小汽缸。η₂ 跳到 22%（世代 IV），但**必须维持高压档位**，否则喘振腰斩。',
  },
  {
    id: 'compound_expansion', name: '复式膨胀机', short: '复式', icon: '🔁', branch: 'efficiency', era: 'E6', cost: 2100000, type: 'qualitative',
    requires: ['high_pressure'],
    effects: { steamGenMul: 1.12, scaleSlopeAdd: 0.05 },
    position: { x: -5, y: 6 },
    desc: '蒸汽在两级汽缸里依次膨胀，把余压榨干。世代效率 +12%，规模效应斜率提升。',
  },

  // ── 输电 ──
  {
    id: 'dc_transmission', name: '直流输电', short: '直流', icon: '🔋', branch: 'efficiency', era: 'E6', cost: 2200000, type: 'unlock',
    requires: ['electromagnetic_induction'],
    effects: { transmitTier: 'dc' },
    // ⚠️ 直流 η₄=0.78 是本代电气化的**最低门槛**：没有它电气化路径几乎不可行
    //    （发电机 η₃×0.78×电动机 η₅ 的连乘会把收益吃光）。
    position: { x: 3, y: 4 },
    desc: '第一条输电方案，η₄ = 78%。能耗高、距离短，但**没有它电气化根本立不住**。',
  },
  {
    id: 'ac_transmission', name: '交流输电', short: '交流', icon: '〰️', branch: 'efficiency', era: 'E6', cost: 3000000, type: 'qualitative',
    requires: ['dc_transmission'],
    effects: { transmitTier: 'ac' },
    position: { x: 3, y: 5 },
    desc: '变压器让电压可升可降，远距离输电损耗降到 12%。电从此可以离开厂区。',
  },
  {
    id: 'hvac_transmission', name: '高压交流输电', short: '高压输电', icon: '🗼', branch: 'efficiency', era: 'E6', cost: 4200000, type: 'numeric',
    requires: ['ac_transmission'],
    effects: { transmitTier: 'hvac' },
    position: { x: 3, y: 6 },
    desc: '把电压推到十万伏级，η₄ = 94%。这是 E6 能拿到的最好输电效率。',
  },

  // ── 生产组织（规模效应）──
  {
    id: 'standardized_parts', name: '标准化零件', short: '标准化', icon: '📐', branch: 'efficiency', era: 'E6', cost: 1800000, type: 'qualitative',
    requires: ['reciprocating_engine'],
    effects: { scaleSlopeAdd: 0.08 },
    position: { x: -3, y: 5 },
    desc: '可互换零件：坏了换一个而不是重做一个。工厂规模效应斜率 +0.08。',
  },
  {
    id: 'assembly_line', name: '流水线', short: '流水线', icon: '➡️', branch: 'efficiency', era: 'E6', cost: 2800000, type: 'qualitative',
    requires: ['standardized_parts'],
    effects: { scaleSlopeAdd: 0.10, factoryOutMul: 1.15 },
    position: { x: -3, y: 6 },
    desc: '把工序排成一条线，工人不动工件动。规模效应斜率 +0.10，工厂产出 +15%。',
  },

  // ── 城市治理（负向因子的**唯一解药**）──
  {
    id: 'public_health_act', name: '公共卫生法', short: '卫生法', icon: '🏥', branch: 'society', era: 'E6', cost: 2000000, type: 'qualitative',
    requires: ['steam_engine_industry'],
    effects: { pollutionReduce: 0.25 },
    // ⚠️ 治理项不是"锦上添花"：E6 后期污染会把卫生因子压到 0.6 一带，
    //    与拥挤系数（0.45）连乘后 r 只剩 0.0074，人口被自己的城市压死。
    //    这两项（卫生法 + 排水系统）合计减免约 40% 污染，是唯一的出口。
    position: { x: 0, y: 6 },
    desc: '用法律管住污水与烟尘：污染累积 −25%。**这是 E6 城市死亡螺旋的唯一解药之一。**',
  },
  {
    id: 'sewer_system', name: '城市排水系统', short: '排水', icon: '🚰', branch: 'society', era: 'E6', cost: 2400000, type: 'qualitative',
    requires: ['public_health_act'],
    effects: { pollutionReduce: 0.20, crowdingReduce: 0.05 },
    position: { x: 0, y: 7 },
    desc: '地下管网让城市容纳更多人而不生病：污染 −20%，拥挤系数再缓解 5%。',
  },

  // ── 铁路 ──
  {
    id: 'steel_rail', name: '钢轨', short: '钢轨', icon: '🛤️', branch: 'efficiency', era: 'E6', cost: 2600000, type: 'numeric',
    requires: ['railroad'],
    effects: { railroadBonusMul: 1.25 },
    position: { x: 4, y: 4 },
    desc: '铁轨换钢轨：寿命与承载都翻倍。铁路工程的三级收益 +25%。',
  },
];
