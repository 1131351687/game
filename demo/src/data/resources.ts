// E1 远古时代 · 资源定义（5 项）

import type { EraId } from './era';

export type ResourceId = 'food' | 'wood' | 'stone' | 'experience' | 'population' | 'grain' | 'livestock' | 'fabric';

export interface ResourceDef {
  id: ResourceId;
  /** 中文名称 */
  name: string;
  /** UI 图标（emoji） */
  icon: string;
  /** 资源分类 */
  category: 'material' | 'abstract' | 'population';
  /** 所属时代（标记数据归属，不改变运行时行为） */
  era: EraId;
  /** 一句话说明 */
  desc: string;
}

export const RESOURCES: ResourceDef[] = [
  {
    id: 'food',
    name: '食物',
    icon: '🍖',
    category: 'material',
    era: 'E1',
    desc: '采集与狩猎所得，支撑人口增长。',
  },
  {
    id: 'wood',
    name: '木材',
    icon: '🪵',
    category: 'material',
    era: 'E1',
    desc: '维持火种的燃料，也是建造住所的原料。',
  },
  {
    id: 'stone',
    name: '石头',
    icon: '🪨',
    category: 'material',
    era: 'E1',
    desc: '制作石器与建造火塘、作坊的原料。',
  },
  {
    id: 'experience',
    name: '经验',
    icon: '💡',
    category: 'abstract',
    era: 'E1',
    desc: '由族人世代积累。本时代尚无文字，知识只能口耳相传——人口越多，积累越快。',
  },
  {
    id: 'population',
    name: '人口',
    icon: '👥',
    category: 'population',
    era: 'E1',
    desc: '既是全部岗位的劳动力，也是经验的来源。上限由住所决定。',
  },
  {
    id: 'grain',
    name: '谷物',
    icon: '🌾',
    category: 'material',
    era: 'E2',
    desc: '定居时代的核心资源。人口每日消耗、开垦田地、喂养牲畜均需谷物；受粮仓上限约束，溢出即浪费。',
  },
  {
    id: 'livestock',
    name: '牲畜',
    icon: '🐐',
    category: 'material',
    era: 'E2',
    desc: '活体储备：宰杀可获 30–38 谷物（不占粮仓上限）；每头每日消耗 0.02 谷物作为饲料。',
  },
  {
    id: 'fabric',
    name: '织物',
    icon: '🧶',
    category: 'material',
    era: 'E2',
    desc: '舒适度因子=火源×(1+0.25×织物覆盖度)，覆盖度由织工产出累计，取值 0→1.0。',
  },
];

export const RESOURCE_MAP: Record<ResourceId, ResourceDef> = Object.fromEntries(
  RESOURCES.map(r => [r.id, r])
) as Record<ResourceId, ResourceDef>;

/** 可在 UI 资源栏显示的实体资源（排除人口，人口单独显示） */
export const MATERIAL_RESOURCES: ResourceId[] = ['food', 'wood', 'stone', 'experience', 'grain', 'livestock', 'fabric'];

/**
 * 返回指定时代的全部资源
 * @param era 时代 id
 */
export function resourcesOfEra(era: EraId): ResourceDef[] {
  return RESOURCES.filter(r => r.era === era);
}
