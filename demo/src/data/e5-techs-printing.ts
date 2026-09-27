import type { TechDef } from './techs';

/**
 * E5 印刷与知识分支（13 项效率科技）。
 *
 * 这条线是**忍耐期的真正来源**：前段 6 项都在给印刷链加产能与效率，
 * 但它们不产出任何物资——木材、铁、人全被吸进纸与典籍里。
 * 真正的回报在中段「印坊分工」（k +0.01）与后段「双人压印机」（印刷 +50%）
 * 才渐次出现。
 *
 * 成本按 1.12^n 铺陈，前段 12 项合计 99,000——即使全点也买不起门槛，
 * 所以玩家必须克制。
 */
export const E5_TECHS_PRINTING: TechDef[] = [
  // ── 前段 ──
  {
    id: 'rag_paper', name: '破布造纸', short: '破布', icon: '🧦', branch: 'printing', era: 'E5', cost: 900, type: 'numeric',
    requires: ['papermaking'],
    effects: { paperOutputMul: 1.2 },
    position: { x: -2, y: 4 },
    desc: '以旧布替代树皮，原料成本骤降。纸张产能 ×1.2。',
  },
  {
    id: 'water_powered_pulp', name: '水轮捣浆', short: '水碓', icon: '💧', branch: 'printing', era: 'E5', cost: 1500, type: 'qualitative',
    requires: ['rag_paper'],
    effects: { paperOutputMul: 1.3 },
    position: { x: -2, y: 5 },
    desc: '用水力代替人力捶打纸浆，造纸工不再是最累的岗位。纸张产能 ×1.3。',
  },
  {
    id: 'alloy_type', name: '铅锡锑合金', short: '合金', icon: '🔩', branch: 'printing', era: 'E5', cost: 2400, type: 'qualitative',
    requires: ['movable_type'],
    effects: { printOutputMul: 1.2 },
    position: { x: -2, y: 6 },
    desc: '字模不再软塌塌——沾墨均匀、耐压耐用。印刷产能 +20%。',
  },
  {
    id: 'university_charter', name: '大学自治特许', short: '特许', icon: '📜', branch: 'printing', era: 'E5', cost: 6800, type: 'unlock',
    requires: ['university_system'],
    effects: { literacyGrowthMul: 1.25, literacyCapAdd: 0.1 },
    position: { x: -2, y: 7 },
    desc: '大学脱离教会与宫廷的直接管束，得以自主招生讲学。识字率增长 ×1.25，上限 +10%。',
  },
  {
    id: 'secular_schools', name: '世俗学校', short: '学校', icon: '🏫', branch: 'printing', era: 'E5', cost: 8000, type: 'qualitative',
    requires: ['university_charter'],
    effects: { literacyGrowthMul: 1.3, literacyCapAdd: 0.15 },
    position: { x: -2, y: 8 },
    desc: '识字不再只属于神职与贵族。识字率增长 ×1.3，上限 +15%——识字率是全局乘数。',
  },
  {
    id: 'vernacular_printing', name: '方言印刷', short: '方言', icon: '🗣️', branch: 'printing', era: 'E5', cost: 9500, type: 'qualitative',
    requires: ['movable_type'],
    effects: { literacyGrowthMul: 1.2, researchOutputMul: 1.1 },
    position: { x: -2, y: 9 },
    desc: '用日常语言印书，读者从一小撮学者变成整个城镇。识字率增长 ×1.2，研究点 ×1.1。',
  },

  // ── 中段 ──
  {
    id: 'scholarship', name: '奖学金制度', short: '奖学金', icon: '🎖️', branch: 'printing', era: 'E5', cost: 30000, type: 'qualitative',
    requires: ['secular_schools'],
    effects: { researchOutputMul: 1.25, literacyGrowthMul: 1.15 },
    position: { x: -3, y: 10 },
    desc: '让穷学生也能读书，学者不再靠家世。研究点 ×1.25。',
  },
  {
    id: 'workshop_division', name: '印坊分工', short: '分工', icon: '🏭', branch: 'printing', era: 'E5', cost: 50000, type: 'qualitative',
    requires: ['alloy_type'],
    effects: { compoundKAdd: 0.01, printOutputMul: 1.2, bookCapacityAdd: 5000 },
    position: { x: -3, y: 11 },
    desc: '排字、刷墨、压印、装订各司其职。**k +0.01**，印刷产能 +20%，典籍存储 +5000。',
  },
  {
    id: 'public_library', name: '公共图书馆', short: '公共馆', icon: '📚', branch: 'printing', era: 'E5', cost: 55000, type: 'unlock',
    requires: ['university_charter'],
    effects: { bookCapacityAdd: 15000, researchOutputMul: 1.15, literacyGrowthMul: 1.15 },
    position: { x: -3, y: 12 },
    desc: '藏书向公众开放——典籍从私产变成公共品。典籍存储 +15000，研究点 ×1.15。',
  },
  {
    id: 'proofreading_pagination', name: '校对与页码', short: '校对', icon: '🔍', branch: 'printing', era: 'E5', cost: 70000, type: 'qualitative',
    requires: ['vernacular_printing'],
    effects: { printOutputMul: 1.15, researchOutputMul: 1.2 },
    position: { x: -3, y: 13 },
    desc: '错字与错页不再靠记忆纠正。知识可以准确累积了——研究点 ×1.2。',
  },
  {
    id: 'oil_ink', name: '油性油墨', short: '油墨', icon: '🖤', branch: 'printing', era: 'E5', cost: 80000, type: 'numeric',
    requires: ['water_powered_pulp'],
    effects: { printOutputMul: 1.3 },
    position: { x: -3, y: 14 },
    desc: '字迹清晰不晕染，双面印刷成为可能。印刷产能 ×1.3。',
  },
  {
    id: 'printers_guild', name: '印刷业行会', short: '行会', icon: '⚜️', branch: 'printing', era: 'E5', cost: 95000, type: 'qualitative',
    requires: ['workshop_division'],
    effects: { printOutputMul: 1.25, bookCapacityAdd: 10000 },
    position: { x: -3, y: 15 },
    desc: '统一字号、纸张规格与学徒年限。印刷产能 ×1.25，典籍存储 +10000。',
  },

  // ── 后段 ──
  {
    id: 'double_press', name: '双人压印机', short: '双压', icon: '🗜️', branch: 'printing', era: 'E5', cost: 550000, type: 'qualitative',
    requires: ['printers_guild'],
    effects: { printOutputMul: 1.5, bookCapacityAdd: 20000 },
    position: { x: -4, y: 16 },
    desc: '两人协同，压印效率近乎翻倍。印刷产能 +50%，典籍存储 +20000——忍耐期的终点在这里。',
  },
];
