import type { TechDef } from './techs';

/**
 * E4 核心：铁、粮食与货币。
 *
 * 这些节点提供扩张的物资底座，但不直接决定战争胜负。
 * 「战争为主、生产为辅」在这里体现为：核心线便宜、稳定，负责供养军略线。
 */
export const E4_TECHS_CORE: TechDef[] = [
  { id: 'steel', name: '钢铁冶炼', short: '冶炼', icon: '⚙️', branch: 'core', era: 'E4', cost: 8000, type: 'unlock', requires: ['iron'], effects: { ironOutputMul: 1.2 }, position: { x: 0, y: 0 }, desc: '改进炉温与锻打，为农具和兵器提供稳定铁料。' },
  { id: 'iron_tools', name: '铁制农具', short: '农具', icon: '⛏️', branch: 'core', era: 'E4', cost: 18000, type: 'unlock', requires: ['steel'], effects: { unlockJobs: ['iron_miner'], foodMultiplier: 1.15 }, position: { x: 0, y: 1 }, desc: '以铁犁、铁锄扩大耕作，同时解锁铁矿工。' },
  { id: 'heavy_plow', name: '牛耕与重犁', short: '牛耕', icon: '🐂', branch: 'core', era: 'E4', cost: 32000, type: 'qualitative', requires: ['iron_tools'], effects: { fieldYieldMul: 1.18 }, position: { x: 0, y: 2 }, desc: '畜力与重犁让单户能耕更多田，粮秣支撑更长战役。' },
  { id: 'water_management', name: '河渠水利', short: '水利', icon: '🌊', branch: 'core', era: 'E4', cost: 55000, type: 'qualitative', requires: ['heavy_plow'], effects: { fieldYieldMul: 1.12, granaryCapacityMul: 1.15 }, position: { x: 0, y: 3 }, desc: '修渠筑堤，扩大可耕地并减少军粮损耗。' },
  { id: 'military_farms', name: '军屯制', short: '军屯', icon: '🌾', branch: 'core', era: 'E4', cost: 70000, type: 'unlock', requires: ['water_management'], effects: { foodMultiplier: 1.18, territoryCapacityMul: 1.08 }, position: { x: 0, y: 4 }, desc: '边地驻军就地屯田，生产与驻防在同一套编制中完成。' },
  { id: 'coinage', name: '铸币制度', short: '铸币', icon: '🪙', branch: 'core', era: 'E4', cost: 30000, type: 'unlock', requires: ['steel'], effects: { unlockBuildings: ['mint'], unlockJobs: ['mint_worker'], coinOutputMul: 1.1 }, position: { x: 0, y: 5 }, desc: '统一钱币与支付标准，让军饷和征伐物资可以跨地区结算。' },
  { id: 'minting', name: '钱粮调拨', short: '调拨', icon: '💰', branch: 'core', era: 'E4', cost: 45000, type: 'numeric', requires: ['coinage'], effects: { coinOutputMul: 1.18 }, position: { x: 0, y: 6 }, desc: '用固定成色与统一账目提高铸币与军费周转效率。' },
];
