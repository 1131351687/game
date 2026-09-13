import type { TechDef } from './techs';

export const E4_TECHS_GOVERNANCE: TechDef[] = [
  { id: 'written_law', name: '成文法', short: '成文', icon: '📜', branch: 'governance', era: 'E4', cost: 10000, type: 'qualitative', requires: ['codification'], effects: { governanceMul: 1.1 }, position: { x: -2, y: 2 }, desc: '让规则脱离个人记忆，降低治理摩擦。' },
  { id: 'census', name: '编户齐民', short: '编户', icon: '📋', branch: 'governance', era: 'E4', cost: 18000, type: 'qualitative', requires: ['written_law'], effects: { territoryCapacityMul: 1.15 }, position: { x: -2, y: 3 }, desc: '以户籍把人口、税赋和义务纳入国家记录。' },
  { id: 'road_building', name: '驰道营造', short: '驰道', icon: '🛣️', branch: 'governance', era: 'E4', cost: 30000, type: 'unlock', requires: ['census'], effects: { unlockBuildings: ['royal_road'] }, position: { x: -2, y: 4 }, desc: '修筑道路，降低行政半径和运输摩擦。' },
  { id: 'provincial_system', name: '郡县制', short: '郡县', icon: '🗺️', branch: 'governance', era: 'E4', cost: 150000, type: 'unlock', requires: ['road_building'], effects: { unlockJobs: ['official'], governanceMul: 1.15 }, position: { x: -2, y: 5 }, desc: '解锁官吏岗位和政体治理框架。' },
  { id: 'administrative_records', name: '行政档案', short: '档案', icon: '🗃️', branch: 'governance', era: 'E4', cost: 220000, type: 'numeric', requires: ['provincial_system'], effects: { governanceMul: 1.1 }, position: { x: -2, y: 6 }, desc: '减少重复登记与行政损耗。' },
  { id: 'imperial_standard', name: '统一法度', short: '法度', icon: '📏', branch: 'governance', era: 'E4', cost: 350000, type: 'numeric', requires: ['administrative_records'], effects: { orderRecoveryMul: 1.15, territoryCapacityMul: 1.15 }, position: { x: -2, y: 7 }, desc: '将度量、法令与行政流程统一到帝国尺度。' },
  { id: 'merit_office', name: '官僚考选', short: '考选', icon: '🧾', branch: 'governance', era: 'E4', cost: 450000, type: 'numeric', requires: ['imperial_standard'], effects: { governanceMul: 1.15 }, position: { x: -2, y: 8 }, desc: '提高官吏的治理质量，减少任用摩擦。' },
  { id: 'provincial_audit', name: '巡察制度', short: '巡察', icon: '🔎', branch: 'governance', era: 'E4', cost: 550000, type: 'numeric', requires: ['merit_office'], effects: { orderRecoveryMul: 1.2, territoryCapacityMul: 1.1 }, position: { x: -2, y: 9 }, desc: '定期巡察边地，降低失序扩散速度。' },
];
