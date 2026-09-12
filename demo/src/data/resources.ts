// E1 远古时代 · 资源定义（5 项）

import type { EraId } from './era';

export type ResourceId = 'food' | 'wood' | 'stone' | 'experience' | 'population' | 'livestock' | 'fabric' | 'copper' | 'tin' | 'bronze' | 'lapis' | 'iron' | 'coin';

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
    // 2026-09-12 用户拍板：**暂时不区分**采集/狩猎所得与农耕收获，
    // 统一称为「食物」（原「谷物」资源已合并进来）。
    // 若将来要恢复粮仓专精与储藏品质的差异化，从这里重新拆分。
    desc: '全部可食用的储备：采集、狩猎与农耕所得，支撑人口增长。受储存上限约束，溢出即浪费。',
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
    desc: '由族人世代积累。本时代尚无文字，知识只能口耳相传——人口越多，积累越快。E3 起更名「知识」，由书吏产出。',
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
    id: 'livestock',
    name: '牲畜',
    icon: '🐐',
    category: 'material',
    era: 'E2',
    desc: '活体储备：宰杀可获 30–38 食物（不占储存上限）；每头每日消耗 0.02 食物作为饲料。',
  },
  {
    id: 'fabric',
    name: '织物',
    icon: '🧶',
    category: 'material',
    era: 'E2',
    desc: '舒适度因子=火源×(1+0.25×织物覆盖度)，覆盖度由织工产出累计，取值 0→1.0。',
  },
  {
    id: 'copper',
    name: '铜',
    icon: '🟠',
    category: 'material',
    era: 'E3',
    desc: '青铜的原料。地壳丰度约 70ppm；仅当本地有铜矿时才能开采（开局随机矿藏）。',
  },
  {
    id: 'tin',
    name: '锡',
    icon: '⚪',
    category: 'material',
    era: 'E3',
    desc: '青铜的另一半。本地**永不产出**（丰度仅为铜的 1/35），只能通过贸易进口——这是本代"必须贸易"的核心约束。',
  },
  {
    id: 'bronze',
    name: '青铜',
    icon: '🥉',
    category: 'material',
    era: 'E3',
    desc: '由冶炼工以铜+锡炼成（每 0.9 铜 + 0.1 锡 → 0.05 青铜/秒）。用于工具世代、建筑与跃迁。',
  },
  {
    id: 'lapis',
    name: '青金石',
    icon: '🔷',
    category: 'material',
    era: 'E3',
    desc: '远方美鲁哈的珍宝，单价 200。需「青金石商路」科技解锁路线；用于声望与奢侈储备。',
  },
];

export const RESOURCE_MAP: Record<ResourceId, ResourceDef> = Object.fromEntries(
  RESOURCES.map(r => [r.id, r])
) as Record<ResourceId, ResourceDef>;

/** 可在 UI 资源栏显示的实体资源（排除人口，人口单独显示） */
export const MATERIAL_RESOURCES: ResourceId[] = ['food', 'wood', 'stone', 'experience', 'livestock', 'fabric', 'copper', 'tin', 'bronze', 'lapis', 'iron', 'coin'];

/**
 * 返回指定时代的全部资源
 * @param era 时代 id
 */
export function resourcesOfEra(era: EraId): ResourceDef[] {
  return RESOURCES.filter(r => r.era === era);
}

/**
 * 研究货币的显示名。
 * E1/E2 叫「经验」，E3 起叫「知识」（用户拍板：改名即可，同一字段）。
 */
export function researchCurrencyName(era: EraId): string {
  return era === 'E3' ? '知识' : '经验';
}
