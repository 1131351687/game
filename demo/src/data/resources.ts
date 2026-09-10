// E1 远古时代 · 资源定义（5 项）

export type ResourceId = 'food' | 'wood' | 'stone' | 'experience' | 'population';

export interface ResourceDef {
  id: ResourceId;
  name: string;
  icon: string;
  category: 'material' | 'abstract' | 'population';
  desc: string;
}

export const RESOURCES: ResourceDef[] = [
  {
    id: 'food',
    name: '食物',
    icon: '🍖',
    category: 'material',
    desc: '采集与狩猎所得，支撑人口增长。',
  },
  {
    id: 'wood',
    name: '木材',
    icon: '🪵',
    category: 'material',
    desc: '维持火种的燃料，也是建造住所的原料。',
  },
  {
    id: 'stone',
    name: '石头',
    icon: '🪨',
    category: 'material',
    desc: '制作石器与建造火塘、作坊的原料。',
  },
  {
    id: 'experience',
    name: '经验',
    icon: '💡',
    category: 'abstract',
    desc: '由族人世代积累。本时代尚无文字，知识只能口耳相传——人口越多，积累越快。',
  },
  {
    id: 'population',
    name: '人口',
    icon: '👥',
    category: 'population',
    desc: '既是全部岗位的劳动力，也是经验的来源。上限由住所决定。',
  },
];

export const RESOURCE_MAP: Record<ResourceId, ResourceDef> = Object.fromEntries(
  RESOURCES.map(r => [r.id, r])
) as Record<ResourceId, ResourceDef>;

/** 可在 UI 资源栏显示的实体资源（排除人口，人口单独显示） */
export const MATERIAL_RESOURCES: ResourceId[] = ['food', 'wood', 'stone', 'experience'];
