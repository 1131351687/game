// E1 远古时代 · 建筑定义（3 座）
// 三座建筑恰好对应三大限制：人口上限 / 环境（火） / 产出

import type { EraId } from './era';
import type { ResourceId } from './resources';

export type BuildingId = 'house' | 'hearth' | 'workshop' | 'village_house' | 'field' | 'granary' | 'animal_pen' | 'kiln' | 'city_house' | 'furnace' | 'academy' | 'trading_post' | 'standard';

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
  limit: 'population' | 'environment' | 'output' | 'record' | 'trade';
  /** 所属时代（标记数据归属，不改变运行时行为） */
  era: EraId;
  /**
   * 被哪座**后续时代**的建筑取代了功能。
   * 该后续建筑所属时代到达后，本建筑不再开放新建（已建成的继续生效）。
   * ——防止便宜旧建筑架空昂贵新建筑（如 E1 住所 30 木 vs E2 村落民居 40木+20石，同为 K+4）。
   */
  supersededBy?: BuildingId;
  /** 该建筑依托的机制在此时代之后失效（如"火"只在 E1 有意义），此后不再开放新建。 */
  obsoleteAfterEra?: EraId;
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
    // E2 起「村落民居」取代其功能（同为 K+4，但更贵——防止便宜旧房架空新内容）
    supersededBy: 'village_house',
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
    // 火种衰减/火源机制只在 E1 有意义（E2 起火因子恒为 1），火塘随之退役
    obsoleteAfterEra: 'E1',
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
    desc: '储存谷物，每座提升谷物上限 800，并提升木材/石头上限 300；配合陶窑可进一步提升。',
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
  {
    id: 'city_house',
    name: '民居',
    icon: '🏠',
    cost: { wood: 220, stone: 120 },
    costMultiplier: 1.0,
    requires: { tech: '' },
    limit: 'population',
    era: 'E3',
    desc: '定居时代的升级版住所，每座人口上限 +130——对应本代人口限制线。',
  },
  {
    id: 'furnace',
    name: '熔炉',
    icon: '🔥',
    cost: { stone: 180, copper: 40 },
    costMultiplier: 1.0,
    requires: { tech: 'bronze_smelting' },
    limit: 'output',
    era: 'E3',
    desc: '冶炼工效率 +25%；解锁冶炼工岗位——对应本代产出限制线。',
  },
  {
    id: 'academy',
    name: '学宫',
    icon: '🏛️',
    cost: { wood: 260, stone: 200 },
    costMultiplier: 1.0,
    requires: { tech: 'clay_tablet' },
    limit: 'record',
    era: 'E3',
    desc: '记录容量 +5——对应本代记录限制线，本代唯一的记录容量来源。',
  },
  {
    id: 'trading_post',
    name: '商栈',
    icon: '⚖️',
    cost: { wood: 150, bronze: 60 },
    costMultiplier: 1.0,
    requires: { tech: 'caravan_org' },
    limit: 'trade',
    era: 'E3',
    desc: '贸易路线槽位 +2——对应本代贸易限制线。',
  },
  {
    id: 'standard',
    name: '标准器',
    icon: '📏',
    cost: { bronze: 100 },
    costMultiplier: 1.0,
    requires: { tech: 'metrology' },
    limit: 'trade',
    era: 'E3',
    desc: '换算损耗 −5%（与度量衡科技叠加）——对应本代贸易限制线。',
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
