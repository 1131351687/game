import type { TechDef } from './techs';

/**
 * E4 军略线：战争是时代主轴。
 *
 * 科技取自战国至秦统一的核心军事演进：常备军、军功爵、铁兵器、骑兵、攻城术、后勤、
 * 统帅与统一战役。生产与后勤只服务于把兵员送到下一座城下。
 */
export const E4_TECHS_MILITARY: TechDef[] = [
  { id: 'legion_organization', name: '常备军', short: '常备', icon: '🛡️', branch: 'military', era: 'E4', cost: 45000, type: 'unlock', requires: ['steel', 'coinage'], effects: { unlockBuildings: ['legion_camp'], unlockJobs: ['legion'], legionPayMul: 0.95 }, position: { x: 2, y: 1 }, desc: '建立脱产常备军，获得征伐和驻防能力。' },
  { id: 'military_merit', name: '军功爵', short: '军功', icon: '🏅', branch: 'military', era: 'E4', cost: 75000, type: 'qualitative', requires: ['legion_organization', 'census'], effects: { legionPowerMul: 1.15, expansionFlatMul: 0.9 }, position: { x: 2, y: 2 }, desc: '以战功授爵，把征伐胜利直接转成可动员的社会动力。' },
  { id: 'iron_weapons', name: '铁兵器', short: '兵器', icon: '⚔️', branch: 'military', era: 'E4', cost: 95000, type: 'unlock', requires: ['steel', 'legion_organization'], effects: { unlockBuildings: ['armory'], legionPowerMul: 1.15 }, position: { x: 2, y: 3 }, desc: '以铁制兵器替换青铜装备，解锁武库并提升军团战力。' },
  { id: 'cavalry', name: '骑兵建制', short: '骑兵', icon: '🐎', branch: 'military', era: 'E4', cost: 140000, type: 'qualitative', requires: ['iron_weapons', 'road_building'], effects: { legionPowerMul: 1.15, expansionFlatMul: 0.85 }, position: { x: 2, y: 4 }, desc: '组建冲击与侦察骑兵，加快野战与对新占区的控制。' },
  { id: 'siegecraft', name: '攻城器械', short: '攻城', icon: '🏰', branch: 'military', era: 'E4', cost: 180000, type: 'numeric', requires: ['iron_weapons', 'coinage'], effects: { expansionFlatMul: 0.75, expansionCostMul: 0.9 }, position: { x: 2, y: 5 }, desc: '云梯、冲车与工兵让坚城不再能长期拖住统一进程。' },
  { id: 'logistics', name: '军需转输', short: '转输', icon: '📦', branch: 'military', era: 'E4', cost: 220000, type: 'numeric', requires: ['cavalry', 'military_farms', 'administrative_records'], effects: { legionPayMul: 0.8, foodMultiplier: 1.1 }, position: { x: 2, y: 6 }, desc: '把漕运、屯田和前军营垒接成一条持续供应线。' },
  { id: 'standard_army', name: '军制统一', short: '军制', icon: '🪖', branch: 'military', era: 'E4', cost: 300000, type: 'numeric', requires: ['cavalry', 'siegecraft', 'logistics'], effects: { legionPowerMul: 1.2, legionPayMul: 0.85 }, position: { x: 2, y: 7 }, desc: '统一编制、装备和训练，让不同来源的军队按一套号令作战。' },
  { id: 'campaign_command', name: '统帅部', short: '统帅', icon: '👑', branch: 'military', era: 'E4', cost: 420000, type: 'numeric', requires: ['standard_army', 'imperial_standard'], effects: { legionPowerMul: 1.2, expansionFlatMul: 0.7 }, position: { x: 2, y: 8 }, desc: '把多路军队纳入统一战役计划，组织最后的统一战争。' },
  { id: 'unification', name: '统一天下', short: '统一', icon: '🚩', branch: 'gate', era: 'E4', cost: 650000, type: 'gate', requires: ['campaign_command'], effects: { enableAdvance: true }, position: { x: 0, y: 10 }, desc: '完成对诸国的军事整合，以统一作为本时代的终点。' },
];
