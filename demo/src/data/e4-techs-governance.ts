import type { TechDef } from './techs';

/**
 * E4 后勤线：户籍、道路和军需。
 *
 * 不提供“点一个按钮维持稳定”的内部经营，而是把新增版图转成可征发的兵员、
 * 粮秣和运输能力。它是军略线的支撑，而不是与战争并行的第二套主循环。
 */
export const E4_TECHS_GOVERNANCE: TechDef[] = [
  { id: 'census', name: '编户齐民', short: '编户', icon: '📋', branch: 'governance', era: 'E4', cost: 15000, type: 'qualitative', requires: ['steel'], effects: { territoryCapacityMul: 1.12 }, position: { x: -2, y: 1 }, desc: '把人口、田亩与负担登记在册，为征兵和军粮提供依据。' },
  { id: 'road_building', name: '驰道', short: '驰道', icon: '🛣️', branch: 'governance', era: 'E4', cost: 35000, type: 'unlock', requires: ['census'], effects: { unlockBuildings: ['royal_road'], expansionFlatMul: 0.9 }, position: { x: -2, y: 2 }, desc: '修筑车马大道，让军队与军粮更快抵达新占之地。' },
  { id: 'provincial_system', name: '郡县征兵', short: '郡县', icon: '🗺️', branch: 'governance', era: 'E4', cost: 85000, type: 'unlock', requires: ['road_building'], effects: { territoryCapacityMul: 1.1 }, position: { x: -2, y: 3 }, desc: '以郡县为征兵与驻军单位，把新领土纳入军府体系。' },
  { id: 'administrative_records', name: '军需簿册', short: '军需', icon: '🗃️', branch: 'governance', era: 'E4', cost: 120000, type: 'numeric', requires: ['provincial_system', 'coinage'], effects: { legionPayMul: 0.9, expansionCostMul: 0.92 }, position: { x: -2, y: 4 }, desc: '核对兵员、粮草和军饷，减少远征中的空耗。' },
  { id: 'imperial_standard', name: '统一度量衡', short: '度量', icon: '📏', branch: 'governance', era: 'E4', cost: 170000, type: 'numeric', requires: ['administrative_records'], effects: { coinOutputMul: 1.15, territoryOutputMul: 1.06 }, position: { x: -2, y: 5 }, desc: '统一尺寸、重量与钱粮标准，使跨地征调和结算更高效。' },
];
