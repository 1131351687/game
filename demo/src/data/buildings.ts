// E1 远古时代 · 建筑定义（3 座）
// 三座建筑恰好对应三大限制：人口上限 / 环境（火） / 产出

import type { EraId } from './era';
import type { ResourceId } from './resources';

export type BuildingId = 'house' | 'hearth' | 'workshop' | 'village_house' | 'field' | 'granary' | 'animal_pen' | 'kiln';

export interface BuildingDef {
  id: BuildingId;
  /** 建筑名称 */
  name: string;
  /** UI 图标（emoji） */
  icon: string;
  /** 建造成本 */
  cost: Partial<Record<ResourceId, number>>;
  /** 成本递增倍率 */
  costMultiplier: number;
  /** 解锁条件 */
  requires: { tech?: string };
  /** 对应的人口的哪一个限制 */
  limit: 'population' | 'environment' | 'output';
  /** 所属时代（标记数据归属，不改变运行时行为） */
  era: EraId;
  /** 一句话说明 */
  desc: string;
}

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'house',
    name: '住所',
    icon: '🏕️',
    cost: { wood: 30 },
    costMultiplier: 1.35,
    requires: { tech: 'shelter_building' },
    limit: 'population',
    era: 'E1',
    desc: '为族人提供栖身之所。每座提升人口上限 4。',
  },
  {
    id: 'hearth',
    name: '火塘',
    icon: '🔥',
    cost: { stone: 20 },
    costMultiplier: 1.4,
    requires: { tech: 'hearth_construction' },
    limit: 'environment',
    era: 'E1',
    desc: '固定的火塘让火种衰减减缓 20%，并提升火种上限 20。',
  },
  {
    id: 'workshop',
    name: '作坊',
    icon: '⚒️',
    cost: { stone: 40 },
    costMultiplier: 1.45,
    requires: { tech: 'stone_knapping' },
    limit: 'output',
    era: 'E1',
    desc: '集中制作工具，使工具世代效果提升 20%。',
  },
  {
    id: 'village_house',
    name: '村落民居',
    icon: '🏘️',
    cost: { wood: 40, stone: 20 },
    costMultiplier: 1.0,
    requires: { tech: 'settled_construction' },
    limit: 'population',
    era: 'E2',
    desc: '定居时代的标准住所，每座提升人口上限 4；取消 E1 承载力硬顶。',
  },
  {
    id: 'field',
    name: '田地',
    icon: '🌾',
    cost: { wood: 80, stone: 50 },
    costMultiplier: 1.0,
    requires: { tech: 'agriculture' },
    limit: 'output',
    era: 'E2',
    desc: '农夫的耕作地，每座提供 3 个工作位；需至少 2 名农夫方可产出。',
  },
  {
    id: 'granary',
    name: '粮仓',
    icon: '🏺',
    cost: { wood: 120, stone: 80 },
    costMultiplier: 1.0,
    requires: { tech: 'granary_building' },
    limit: 'output',
    era: 'E2',
    desc: '储存谷物，每座提升谷物上限 800；配合陶窑可进一步提升。',
  },
  {
    id: 'animal_pen',
    name: '畜栏',
    icon: '🐐',
    cost: { wood: 60, stone: 40 },
    costMultiplier: 1.0,
    requires: { tech: 'animal_domestication' },
    limit: 'output',
    era: 'E2',
    desc: '圈养牲畜，每座提升牲畜上限 20 并提供 3 个牧人工作位。',
  },
  {
    id: 'kiln',
    name: '陶窑',
    icon: '🏺',
    cost: { stone: 100, wood: 40 },
    costMultiplier: 1.0,
    requires: { tech: 'pottery' },
    limit: 'output',
    era: 'E2',
    desc: '烧制陶器，每座提升谷物上限 15%（最多 3 座生效）。',
  },
];

export const BUILDING_MAP: Record<BuildingId, BuildingDef> = Object.fromEntries(
  BUILDINGS.map(b => [b.id, b])
) as Record<BuildingId, BuildingDef>;

/**
 * 返回指定时代的全部建筑
 * @param era 时代 id
 */
export function buildingsOfEra(era: EraId): BuildingDef[] {
  return BUILDINGS.filter(b => b.era === era);
}
