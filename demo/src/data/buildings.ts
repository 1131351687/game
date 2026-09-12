// E1 远古时代 · 建筑定义（3 座）
// 三座建筑恰好对应三大限制：人口上限 / 环境（火） / 产出

import type { EraId } from './era';
import type { ResourceId } from './resources';

export type BuildingId = 'house' | 'hearth' | 'workshop' | 'village_house' | 'field' | 'granary' | 'animal_pen' | 'kiln' | 'city_house' | 'furnace' | 'academy' | 'trading_post' | 'standard' | 'chancery' | 'road' | 'mint' | 'fort' | 'housing_1' | 'housing_2' | 'housing_3' | 'housing_4' | 'stele';

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
  limit: 'population' | 'environment' | 'output' | 'record' | 'trade' | 'governance' | 'radius' | 'payment' | 'expansion' | 'institution';
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

  // ── E4 帝国时代（9 座；数值来自 E4-empire.md §8）──
  {
    id: 'chancery',
    name: '官署',
    icon: '🏛️',
    cost: { wood: 2000, iron: 800 },
    costMultiplier: 1.6,
    requires: { tech: 'law_code' },
    limit: 'governance',
    era: 'E4',
    // 治理效率按"座数等级"计算（Lv k → ×(1+0.25k)，Lv0–4），等级逻辑在引擎层实现
    desc: '提供 12 个官吏岗位；官署等级提升治理效率 ×(1+0.25k)。治理供给的来源。',
  },
  {
    id: 'road',
    name: '驰道',
    icon: '🛣️',
    cost: { wood: 1500, iron: 1200 },
    costMultiplier: 1.9,
    requires: { tech: 'road_building' },
    limit: 'radius',
    era: 'E4',
    desc: '行政半径惩罚系数 −0.006/级（Lv0–4）。用基础设施"购买规模"。',
  },
  {
    id: 'mint',
    name: '铸币厂',
    icon: '🪙',
    cost: { wood: 1200, iron: 1500 },
    costMultiplier: 1.5,
    requires: { tech: 'coinage' },
    limit: 'payment',
    era: 'E4',
    desc: '提供 20 个铸币工岗位。铸币三层依赖链的中枢。',
  },
  {
    id: 'fort',
    name: '军团营垒',
    icon: '🏕️',
    cost: { wood: 1000, iron: 2000 },
    costMultiplier: 1.5,
    requires: { tech: 'legion_org' },
    limit: 'expansion',
    era: 'E4',
    desc: '军团容量 +2；兵员配额 +0.3%。扩张资格与武力压制的来源。',
  },
  {
    id: 'housing_1',
    name: '土坯住宅',
    icon: '🏚️',
    cost: { wood: 800 },
    costMultiplier: 1.0,
    requires: { tech: 'law_code' },
    limit: 'population',
    era: 'E4',
    desc: '第一代住宅：人口上限 K +100。四级世代住宅的第一级。',
  },
  {
    id: 'housing_2',
    name: '砖木住宅',
    icon: '🏠',
    cost: { wood: 4000, iron: 2000 },
    costMultiplier: 1.0,
    requires: { tech: 'household_reg' },
    limit: 'population',
    era: 'E4',
    desc: '第二代住宅：人口上限 K +400。',
  },
  {
    id: 'housing_3',
    name: '公寓楼',
    icon: '🏢',
    cost: { wood: 12000, iron: 8000 },
    costMultiplier: 1.0,
    requires: { tech: 'census' },
    limit: 'population',
    era: 'E4',
    desc: '第三代住宅：人口上限 K +1,600。对应罗马 insula 式的多层公寓。',
  },
  {
    id: 'housing_4',
    name: '高层住宅区',
    icon: '🏙️',
    cost: { wood: 40000, iron: 30000, coin: 20000 },
    costMultiplier: 1.0,
    requires: { tech: 'building_code' },
    limit: 'population',
    era: 'E4',
    desc: '第四代住宅：人口上限 K +6,400。现代前的居住密度顶点。',
  },
  {
    id: 'stele',
    name: '法典碑',
    icon: '🗿',
    cost: { iron: 3000, coin: 5000 },
    costMultiplier: 2.2,
    requires: { tech: 'written_law' },
    limit: 'institution',
    era: 'E4',
    desc: '+1 法典条款槽位（初始 2，上限 8）。制度带宽的来源。',
  },
  // ⚠️ TODO(balance)：住宅"四级世代"的本代成本阶梯为草案（文档只写"木材/铁 阶梯"，未给数）；
  // 第 2–4 级的门控科技（编户齐民/户籍普查/营造法式）为按科技表就近指派，待配平定稿。
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
