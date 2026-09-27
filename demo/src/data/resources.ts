// E1 远古时代 · 资源定义（5 项）

import { eraDistance, type EraId } from './era';

export type ResourceId = 'food' | 'wood' | 'stone' | 'experience' | 'population' | 'livestock' | 'fabric' | 'copper' | 'tin' | 'bronze' | 'lapis' | 'iron' | 'coin' | 'paper' | 'books' | 'silver' | 'researchPoints' | 'exoticGoods' | 'coal' | 'steel' | 'electricity' | 'industrial';

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
    desc: '青铜的另一半。普通冲积平原不能产出；锡矿带可少量开采，但稳定供应仍依赖贸易。',
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
  {
    id: 'iron',
    name: '铁',
    icon: '⛏️',
    category: 'material',
    era: 'E4',
    desc: '铁器时代的基础材料，用于驰道、铸币厂、军团营垒与武库。',
  },
  {
    id: 'coin',
    name: '铸币',
    icon: '🪙',
    category: 'material',
    era: 'E4',
    desc: '标准化支付媒介，用于军团军饷和领土扩张。',
  },
  // ── E5 远洋时代（按 E5-maritime.md §6 资源集）──
  {
    id: 'paper',
    name: '纸张',
    icon: '📄',
    category: 'material',
    era: 'E5',
    desc: '印刷链的中间品：造纸工以 0.5 木/秒 产出 1.2 纸/秒。受储存上限约束（图书馆扩容）。',
  },
  {
    id: 'books',
    name: '典籍',
    icon: '📖',
    category: 'material',
    era: 'E5',
    // 关键设计：典籍**不是积分**，而是被学者"读掉"的消耗品。
    // 因此库存会因为学者在岗而下降——这是刻意的，不是 bug。
    desc: '印刷工的产物，也是学者的口粮：0.5 典/秒 → 2.0 研究点/秒。被读掉即消失，不是积分。',
  },
  {
    id: 'silver',
    name: '白银',
    icon: '💠',
    category: 'material',
    era: 'E5',
    // 印书坊与大学都要白银 → 玩家必须至少远航一次，形成机制闭环。
    desc: '远航带回的通货。印书坊与大学都要白银，逼迫玩家出海——单次远航本是亏本买卖。',
  },
  {
    id: 'researchPoints',
    name: '研究点',
    icon: '🔬',
    category: 'abstract',
    era: 'E5',
    // 与 E3/E4 的「知识」并存，不做换算（E5-devplan §4.1 推荐方案 A）。
    desc: 'E5 起的研究货币，由学者产出。与「知识」并存，不做换算（旧字段保留不清零）。',
  },
  {
    id: 'exoticGoods',
    name: '异域物产',
    icon: '🌶️',
    category: 'abstract',
    era: 'E5',
    // 非消耗资源：只增不减，代表"已知的世界有多大"。
    desc: '远航带回的见闻与物种。只增不减，用于兑换永久加成（物种交换）。',
  },
  // ── E6 机器时代（按 E6-machine.md §6 资源集）──
  {
    id: 'coal',
    name: '煤',
    icon: '⚫',
    category: 'material',
    era: 'E6',
    // 能量链的**起点**，也是炼钢的还原剂 —— 两个需求会互相争夺同一批煤，
    // 这是本代第一个瓶颈（煤荒）。
    desc: '矿工采出。锅炉的燃料、炼钢的还原剂，能量链的起点。司炉工不足时烧不动它。',
  },
  {
    id: 'steel',
    name: '钢',
    icon: '🔩',
    category: 'material',
    era: 'E6',
    // 炼钢工耗煤产钢 → 与锅炉争夺煤，构成煤荒的第二个来源。
    desc: '炼钢工以 0.15 钢/秒 产出，每产 1 钢耗 0.8 煤/秒。工业化的一切结构件都靠它。',
  },
  {
    id: 'electricity',
    name: '电',
    icon: '⚡',
    category: 'material',
    era: 'E6',
    // 电气化的门票：没有输电科技时 η₄ = 1 但发电厂本身要走 η₃，
    // 且电网 ρ 会把发电不足如实反映成降速。
    desc: '发电厂由机械能转换而来。电气化路径比直驱多两道损耗，却能摆脱传动轴的摩擦瓶颈。',
  },
  {
    id: 'industrial',
    name: '工业品',
    icon: '🏭',
    category: 'material',
    era: 'E6',
    // 按 devplan T1.1：工业品**不进 TopBar 主资源条**，它是"产能"，
    // 显示在工厂/能量链面板。放这里只是为了让 ResourceId 联合类型完整。
    desc: '工厂的产出：6 × 规模系数 × 供给率 × ρ。不进主资源条——它是产能读数，不是囤积物。',
  },
];

export const RESOURCE_MAP: Record<ResourceId, ResourceDef> = Object.fromEntries(
  RESOURCES.map(r => [r.id, r])
) as Record<ResourceId, ResourceDef>;

/** 可在 UI 资源栏显示的实体资源（排除人口，人口单独显示） */
export const MATERIAL_RESOURCES: ResourceId[] = ['food', 'wood', 'stone', 'experience', 'livestock', 'fabric', 'copper', 'tin', 'bronze', 'lapis', 'iron', 'coin', 'paper', 'books', 'silver', 'researchPoints', 'exoticGoods'];

/**
 * 返回指定时代的全部资源
 * @param era 时代 id
 */
export function resourcesOfEra(era: EraId): ResourceDef[] {
  return RESOURCES.filter(r => r.era === era);
}

/**
 * 研究货币的显示名。
 * E1/E2 叫「经验」，E3/E4 叫「知识」，E5 起叫「研究点」。
 * （用户拍板：改名即可，字段本身沿用 knowledge；E5 另有 researchPoints 字段，两者并存不换算。）
 */
export function researchCurrencyName(era: EraId): string {
  if (era === 'E5') return '研究点';
  return eraDistance('E3', era) >= 0 ? '知识' : '经验';
}
