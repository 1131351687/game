import type { TechDef } from './techs';

export const E4_TECHS_CORE: TechDef[] = [
  { id: 'steel', name: '钢铁', short: '钢铁', icon: '⚙️', branch: 'core', era: 'E4', cost: 6000, type: 'unlock', requires: ['iron'], effects: { ironOutputMul: 1.1 }, position: { x: 0, y: 0 }, desc: '铁器与高温冶炼让大规模工程成为可能，并提升铁矿基础产出。' },
  { id: 'codification', name: '法典', short: '法典', icon: '⚖️', branch: 'core', era: 'E4', cost: 10000, type: 'qualitative', requires: ['steel'], effects: { unlockBuildings: ['code_stele'] }, position: { x: 0, y: 1 }, desc: '把习惯法固定为可复制的治理规则。' },
  { id: 'iron_tools', name: '铁制农具', short: '农具', icon: '⛏️', branch: 'core', era: 'E4', cost: 25000, type: 'unlock', requires: ['steel'], effects: { unlockJobs: ['iron_miner'], foodMultiplier: 1.25 }, position: { x: 0, y: 2 }, desc: '解锁铁矿工，并提升农业与工程的基础能力。' },
  { id: 'heavy_plow', name: '重犁水利', short: '重犁', icon: '🌾', branch: 'core', era: 'E4', cost: 40000, type: 'qualitative', requires: ['iron_tools'], effects: { fieldYieldMul: 1.15 }, position: { x: 0, y: 3 }, desc: '以畜力和水利扩大可耕作土地，提升田地产出。' },
  { id: 'coinage', name: '货币制度', short: '货币', icon: '🪙', branch: 'core', era: 'E4', cost: 50000, type: 'unlock', requires: ['codification'], effects: { unlockBuildings: ['mint'], coinOutputMul: 1.1 }, position: { x: 0, y: 4 }, desc: '统一支付尺度，为官僚与军团提供持续结算媒介。' },
  { id: 'printing', name: '印刷术', short: '印刷', icon: '📖', branch: 'gate', era: 'E4', cost: 2600000, type: 'gate', requires: ['coinage'], requiresAny: ['provincial_system', 'military_merit', 'road_building'], effects: { enableAdvance: true }, position: { x: 0, y: 9 }, desc: '复制制度与知识，推开远洋时代。' },
  { id: 'water_management', name: '水利管理', short: '水利', icon: '🌊', branch: 'core', era: 'E4', cost: 70000, type: 'qualitative', requires: ['heavy_plow'], effects: { granaryCapacityMul: 1.2, fieldYieldMul: 1.1 }, position: { x: 0, y: 5 }, desc: '把畜力、河渠和土地组织成可扩大的粮食基础。' },
  { id: 'steel_working', name: '钢铁工艺', short: '钢艺', icon: '🔥', branch: 'core', era: 'E4', cost: 90000, type: 'numeric', requires: ['steel'], effects: { ironOutputMul: 1.3 }, position: { x: 0, y: 6 }, desc: '提高铁器生产的稳定性，为道路和军备提供材料。' },
];
