import type { TechDef } from './techs';

/**
 * E5 科学与开拓分支（7 项）。
 *
 * 这条线负责把「忍耐期攒下的复利」换成**真正改变规则的东西**：
 * 银行让白银可以预支、新作物让承载力跳一档、科学方法直接给 k +0.02。
 *
 * 「科学方法」是本分支的顶点，也是全代最重要的一枚 k 加值——
 * 它自己很贵（800,000），前置也很长，但一旦点到，
 * 复利系数的上限就从 0.08 抬到 0.10，R 的理论天花板 ×4.20 才真正可达。
 *
 * 注：火药的军事效果由支撑节点提供，本文件不重复。
 */
export const E5_TECHS_SCIENCE: TechDef[] = [
  // ── 前段 ──
  {
    id: 'double_entry_bookkeeping', name: '复式记账', short: '记账', icon: '📒', branch: 'science', era: 'E5', cost: 3500, type: 'unlock',
    requires: ['gunpowder'],
    effects: { enableBank: true },
    position: { x: 3, y: 2 },
    desc: '借贷两方必须同时平账。**银行与信贷由此解锁**——白银可以先花后还。',
  },

  // ── 中段 ──
  {
    id: 'anatomy', name: '解剖学', short: '解剖', icon: '🫀', branch: 'science', era: 'E5', cost: 40000, type: 'qualitative',
    requires: ['double_entry_bookkeeping'],
    effects: { popGrowthMul: 1.1, researchOutputMul: 1.15 },
    position: { x: 3, y: 3 },
    desc: '打开身体看清楚结构——医学第一次有了依据。人口增长率 +10%，研究点 ×1.15。',
  },
  {
    id: 'bank_credit', name: '银行与信贷', short: '银行', icon: '🏦', branch: 'science', era: 'E5', cost: 110000, type: 'unlock',
    requires: ['double_entry_bookkeeping'],
    effects: { enableBank: true, researchOutputMul: 1.2 },
    position: { x: 3, y: 4 },
    desc: '把沉淀的白银变成流动的信用。可预支白银，代价是利息。',
  },
  {
    id: 'new_crops', name: '新作物栽培', short: '新作物', icon: '🌽', branch: 'science', era: 'E5', cost: 160000, type: 'unlock',
    requires: ['anatomy'],
    effects: { foodMultiplier: 1.3, carryCapacityAdd: 150, popGrowthMul: 1.08 },
    position: { x: 3, y: 5 },
    desc: '玉米与马铃薯上岸。食物 +30%，承载力 +150——这是远航带回的最实在的东西。',
  },

  // ── 后段 ──
  {
    id: 'mining_blasting', name: '采矿爆破', short: '爆破', icon: '🧨', branch: 'science', era: 'E5', cost: 250000, type: 'qualitative',
    requires: ['new_crops'],
    effects: { minerOutputMul: 1.4, ironOutputMul: 1.25 },
    position: { x: 4, y: 6 },
    desc: '把火药埋进矿脉。矿工产出 ×1.4，铁 ×1.25——开通 E6 的重工业原料。',
  },
  {
    id: 'heliocentrism', name: '日心说', short: '日心说', icon: '☀️', branch: 'science', era: 'E5', cost: 700000, type: 'qualitative',
    requires: ['mining_blasting'],
    effects: { researchOutputMul: 1.35, literacyGrowthMul: 1.2 },
    position: { x: 4, y: 7 },
    desc: '地球绕着太阳转——权威第一次输给了观测。研究点 ×1.35。',
  },
  {
    id: 'scientific_method', name: '科学方法', short: '方法', icon: '🔬', branch: 'science', era: 'E5', cost: 800000, type: 'qualitative',
    requires: ['heliocentrism'],
    effects: { compoundKAdd: 0.02, researchOutputMul: 1.4, printOutputMul: 1.15 },
    position: { x: 4, y: 8 },
    desc: '假设、实验、复现、证伪——知识第一次有了自我纠错的流程。**k +0.02**，复利系数的最后一块拼图。',
  },
];
