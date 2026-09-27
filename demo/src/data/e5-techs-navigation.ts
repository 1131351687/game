import type { TechDef } from './techs';

/**
 * E5 远洋与航海分支（8 项）。
 *
 * 这条线决定**白银进不进得来**。印书坊与大学的成本里都有白银，
 * 而白银只能从远航带回——所以航海线不是可选项，是印刷链的物料前提。
 *
 * 首次完成第 2 环（远洋）会强制触发「发现新大陆」，之后每次远航都按
 * 权重表结算事件（多数期望为负，单次远航在数值上刻意不划算）。
 */
export const E5_TECHS_NAVIGATION: TechDef[] = [
  // ── 前段 ──
  {
    id: 'celestial_navigation', name: '天文导航', short: '天文', icon: '✨', branch: 'navigation', era: 'E5', cost: 5500, type: 'qualitative',
    requires: ['compass'],
    effects: { voyageBonus: 0.1 },
    position: { x: 1, y: 2 },
    desc: '以星辰定纬度。远航推进速度 +10%，返航不再靠运气。',
  },
  {
    id: 'caravel', name: '卡拉维尔帆船', short: '帆船', icon: '⛵', branch: 'navigation', era: 'E5', cost: 11000, type: 'qualitative',
    requires: ['celestial_navigation'],
    effects: { voyageBonus: 0.15 },
    position: { x: 1, y: 3 },
    desc: '轻捷、逆风可航、吃水浅。远航推进速度 +15%——三桅帆船时代的真正主力。',
  },
  {
    id: 'astrolabe_quadrant', name: '星盘与四分仪', short: '星盘', icon: '🧮', branch: 'navigation', era: 'E5', cost: 13000, type: 'qualitative',
    requires: ['celestial_navigation'],
    effects: { voyageBonus: 0.12, researchOutputMul: 1.08 },
    position: { x: 1, y: 4 },
    desc: '把星空变成可测量的刻度。远航推进 +12%，并反哺研究点 +8%。',
  },
  {
    id: 'logbook', name: '航海日志', short: '日志', icon: '📔', branch: 'navigation', era: 'E5', cost: 15000, type: 'qualitative',
    requires: ['celestial_navigation'],
    effects: { voyageBonus: 0.1, literacyGrowthMul: 1.1 },
    position: { x: 1, y: 5 },
    desc: '每一次航行都写成记录，错误不会再犯第二次。远航 +10%，识字率增长 ×1.1。',
  },
  {
    id: 'lateen_sail', name: '三角帆', short: '三角帆', icon: '🔺', branch: 'navigation', era: 'E5', cost: 21900, type: 'qualitative',
    requires: ['caravel'],
    effects: { voyageBonus: 0.2 },
    position: { x: 1, y: 6 },
    desc: '纵帆让船能抢风前行。远航推进速度 +20%，逆风不再是绝境。',
  },

  // ── 中段 ──
  {
    id: 'telescope', name: '望远镜', short: '望远镜', icon: '🔭', branch: 'navigation', era: 'E5', cost: 130000, type: 'qualitative',
    requires: ['lateen_sail'],
    effects: { voyageBonus: 0.2, researchOutputMul: 1.25 },
    position: { x: 2, y: 7 },
    desc: '看得更远，也看得更细。远航推进 +20%，研究点 ×1.25——它是航海与科学共用的工具。',
  },

  // ── 后段 ──
  {
    id: 'colonial_outpost', name: '殖民据点', short: '据点', icon: '🏝️', branch: 'navigation', era: 'E5', cost: 400000, type: 'unlock',
    requires: ['telescope'],
    effects: { voyageBonus: 0.25, foodMultiplier: 1.15, territoryCapacityMul: 1.15 },
    position: { x: 2, y: 8 },
    desc: '在远方留下常驻据点，航线不再是一次性往返。远航 +25%，食物 +15%。',
  },
  {
    id: 'circumnavigation', name: '环球航线', short: '环球', icon: '🌍', branch: 'navigation', era: 'E5', cost: 1400000, type: 'qualitative',
    requires: ['colonial_outpost'],
    effects: { voyageBonus: 0.4, researchOutputMul: 1.3 },
    position: { x: 2, y: 9 },
    desc: '地球是圆的——所有海域连成一张网。远航推进 +40%，研究点 ×1.3。',
  },
];
