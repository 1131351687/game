import type { TechDef } from './techs';

export const E4_TECHS_MILITARY: TechDef[] = [
  { id: 'minting', name: '铸币', short: '铸币', icon: '🪙', branch: 'military', era: 'E4', cost: 50000, type: 'unlock', requires: ['coinage'], effects: { unlockJobs: ['mint_worker'] }, position: { x: 2, y: 4 }, desc: '解锁铸币工，将金属转为标准化支付手段。' },
  { id: 'legion_organization', name: '军团编制', short: '军团', icon: '🛡️', branch: 'military', era: 'E4', cost: 85000, type: 'unlock', requires: ['minting'], effects: { unlockBuildings: ['legion_camp'], unlockJobs: ['legion'], legionPayMul: 0.85 }, position: { x: 2, y: 5 }, desc: '建立常备军团，获得扩张与压制能力。' },
  { id: 'military_merit', name: '军功爵', short: '军功', icon: '🏅', branch: 'military', era: 'E4', cost: 120000, type: 'qualitative', requires: ['legion_organization'], effects: { orderRecoveryMul: 1.1, territoryCapacityMul: 1.1 }, position: { x: 2, y: 6 }, desc: '以军功组织兵员与社会晋升。' },
  { id: 'fortification', name: '边防营垒', short: '边防', icon: '🏰', branch: 'military', era: 'E4', cost: 180000, type: 'numeric', requires: ['military_merit'], effects: { expansionFlatMul: 0.8 }, position: { x: 2, y: 7 }, desc: '让新并入领土更快完成平定。' },
  { id: 'logistics', name: '军需体系', short: '军需', icon: '📦', branch: 'military', era: 'E4', cost: 260000, type: 'numeric', requires: ['fortification'], effects: { legionPayMul: 0.85 }, position: { x: 2, y: 8 }, desc: '统一军粮和军饷调度，降低持续支出压力。' },
  { id: 'frontier_command', name: '边疆都护', short: '都护', icon: '🛡️', branch: 'military', era: 'E4', cost: 380000, type: 'numeric', requires: ['logistics'], effects: { expansionFlatMul: 0.8 }, position: { x: 2, y: 9 }, desc: '以区域指挥体系维持远方边疆。' },
  { id: 'standard_army', name: '军制标准化', short: '军制', icon: '⚔️', branch: 'military', era: 'E4', cost: 500000, type: 'numeric', requires: ['frontier_command'], effects: { legionPayMul: 0.8 }, position: { x: 2, y: 10 }, desc: '统一装备、编制和训练流程。' },
  { id: 'imperial_command', name: '帝国统帅部', short: '统帅', icon: '👑', branch: 'military', era: 'E4', cost: 650000, type: 'numeric', requires: ['standard_army'], effects: { governanceMul: 1.1, orderRecoveryMul: 1.1 }, position: { x: 2, y: 11 }, desc: '把分散军团纳入统一的帝国战略。' },
];
