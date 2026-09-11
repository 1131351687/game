// 科技效果 / 类型 → 中文文案（共享模块）
//
// 这套渲染逻辑原本写在 TechCategories.tsx 内部（describeEffects + EFFECT_RENDERERS +
// TYPE_LABEL）。现在文明页改成了方块网格（TechGrid.tsx），同样需要把 TechEffects 翻成
// 可读的中文行，所以把它们抽到这里成为「单一来源」，避免两套实现各写各的、改一处忘另一处。
//
// 这里只负责"把已聚合好的单个 TechEffects 翻成文字"，不关心科技是否可研究、
// 不涉及经验/前置判断——那些由 engine / reveal 负责。

import { JOB_MAP } from '../../data/jobs';
import { BUILDING_MAP } from '../../data/buildings';
import { TOOL_TIERS } from '../../data/constants';
import { formatNumber } from '../../core/format';
import type { TechEffects, TechType } from '../../data/techs';

// 每个 renderer 负责一个 effect key：没有该 key 就返回 null 被过滤掉。
// 这样新增 effect 只需加一行，且天然保持定义顺序、类型安全（无 any）。
const EFFECT_RENDERERS: ReadonlyArray<(e: TechEffects) => string | null> = [
  e => (e.enableFire ? '开启火种系统' : null),
  e => (e.activeFireRestore ? '可主动补充火种' : null),
  e =>
    e.fireDecayMultiplier !== undefined
      ? `火种衰减 ×${formatNumber(e.fireDecayMultiplier, 2)}`
      : null,
  e => (e.fireMaxBonus !== undefined ? `火种上限 +${formatNumber(e.fireMaxBonus)}` : null),
  e => (e.removeWeakFoodPenalty ? '火种微弱时不再有食物惩罚' : null),
  e => (e.foodMultiplier !== undefined ? `食物产出 ×${formatNumber(e.foodMultiplier, 2)}` : null),
  e => (e.stoneMultiplier !== undefined ? `石头产出 ×${formatNumber(e.stoneMultiplier, 2)}` : null),
  e => (e.expMultiplier !== undefined ? `经验产出 ×${formatNumber(e.expMultiplier, 2)}` : null),
  e =>
    e.gathererMultiplier !== undefined
      ? `采集者效率 ×${formatNumber(e.gathererMultiplier, 2)}`
      : null,
  e => {
    if (e.setToolTier === undefined) return null;
    const tier = TOOL_TIERS.find(t => t.level === e.setToolTier);
    return `工具世代 →「${tier?.name ?? `等级 ${e.setToolTier}`}」`;
  },
  e =>
    e.buildingCostMultiplier !== undefined
      ? `建筑成本 ×${formatNumber(e.buildingCostMultiplier, 2)}`
      : null,
  e => (e.stabilityBonus !== undefined ? `社会稳定 +${formatNumber(e.stabilityBonus)}` : null),
  // 集体围猎的两个字段一起读才成句，这里合成一条
  e => {
    if (e.huntPartyThreshold === undefined && e.huntPartyBonus === undefined) return null;
    const threshold = e.huntPartyThreshold ?? 0;
    const bonus = Math.round((e.huntPartyBonus ?? 0) * 100);
    return `猎人数达 ${threshold} 人时全员效率 +${bonus}%`;
  },
  e =>
    e.foodStorageMultiplier !== undefined
      ? `食物存储上限 ×${formatNumber(e.foodStorageMultiplier, 2)}`
      : null,
  e =>
    e.unlockJobs && e.unlockJobs.length > 0
      ? `解锁岗位：${e.unlockJobs.map(id => JOB_MAP[id]?.name ?? id).join('、')}`
      : null,
  e =>
    e.unlockBuildings && e.unlockBuildings.length > 0
      ? `解锁建筑：${e.unlockBuildings.map(id => BUILDING_MAP[id]?.name ?? id).join('、')}`
      : null,
  e => (e.enableAdvance ? '开启时代跃迁' : null),
  // ─────────────────────────────────────────────
  // 以下为 E2 定居时代新增的 effect 键，沿用同样的「有则成句、无则返回 null」约定
  // ─────────────────────────────────────────────
  e =>
    e.enableSeasons !== undefined ? '开启季节循环（春耕、夏长、秋收、冬藏）' : null,
  e => (e.springAgriMul !== undefined ? `春季农业倍率 +${formatNumber(e.springAgriMul, 2)}` : null),
  e => (e.summerAgriMul !== undefined ? `夏季农业倍率 +${formatNumber(e.summerAgriMul, 2)}` : null),
  e => (e.autumnAgriMul !== undefined ? `秋季农业倍率 +${formatNumber(e.autumnAgriMul, 2)}` : null),
  e => (e.winterAgriMul !== undefined ? `冬季农业倍率 +${formatNumber(e.winterAgriMul, 2)}` : null),
  e => (e.grainMultiplier !== undefined ? `谷物总产出 ×${formatNumber(e.grainMultiplier, 2)}` : null),
  e =>
    e.jobMultiplier && Object.keys(e.jobMultiplier).length > 0
      ? `岗位效率：${Object.entries(e.jobMultiplier)
          .map(([k, v]) => `${JOB_MAP[k as keyof typeof JOB_MAP]?.name ?? k} ×${formatNumber(v ?? 1, 2)}`)
          .join('、')}`
      : null,
  e =>
    e.resourceMultiplier && Object.keys(e.resourceMultiplier).length > 0
      ? `资源产出：${Object.entries(e.resourceMultiplier)
          .map(([k, v]) => `${k} ×${formatNumber(v ?? 1, 2)}`)
          .join('、')}`
      : null,
  e =>
    e.unlockResources && e.unlockResources.length > 0
      ? `解锁资源：${e.unlockResources.join('、')}`
      : null,
  e => (e.livestockFoodMul !== undefined ? `牲畜产食物 ×${formatNumber(e.livestockFoodMul, 2)}` : null),
  e => (e.summerHerderMul !== undefined ? `夏季牧人效率 ×${formatNumber(e.summerHerderMul, 2)}` : null),
  e => (e.penCapacityAdd !== undefined ? `每座畜栏存栏上限 +${formatNumber(e.penCapacityAdd)}` : null),
  e => (e.livestockTier !== undefined ? `牲畜世代 → 等级 ${formatNumber(e.livestockTier)}` : null),
  e =>
    e.livestockFamineSurvival !== undefined
      ? `饥荒时牲畜存活率 ${formatNumber(e.livestockFamineSurvival * 100, 0)}%`
      : null,
  e => (e.fieldYieldMul !== undefined ? `田地产出 ×${formatNumber(e.fieldYieldMul, 2)}` : null),
  e => (e.fieldEfficiencyCap !== undefined ? `田地效率上限 ≈ ${formatNumber(e.fieldEfficiencyCap, 2)}` : null),
  e => (e.feedCostMultiplier !== undefined ? `饲料成本 ×${formatNumber(e.feedCostMultiplier, 2)}` : null),
  e => (e.villageHouseCostMul !== undefined ? `民居成本 ×${formatNumber(e.villageHouseCostMul, 2)}` : null),
  e => (e.granaryPerUnit !== undefined ? `单座粮仓容量 +${formatNumber(e.granaryPerUnit)}` : null),
  e => (e.granaryCapacityMul !== undefined ? `粮仓总容量 ×${formatNumber(e.granaryCapacityMul, 2)}` : null),
  e => (e.kilnBonus !== undefined ? `陶窑加成 +${formatNumber(e.kilnBonus, 2)}` : null),
  e => (e.granaryOverflowBonus !== undefined ? `粮仓溢出阈值 +${formatNumber(e.granaryOverflowBonus, 2)}` : null),
  e => (e.jobSwitchCostMul !== undefined ? `岗位切换成本 ×${formatNumber(e.jobSwitchCostMul, 2)}` : null),
  e => (e.removeCapacityCap ? '取消承载力硬顶（聚落可自由扩张）' : null),
];

/** 把一个科技的 effects 渲染成若干条中文说明（无效果时返回空数组） */
export function describeEffects(effects: TechEffects): string[] {
  const out: string[] = [];
  for (const render of EFFECT_RENDERERS) {
    const line = render(effects);
    if (line !== null) out.push(line);
  }
  return out;
}

/** 科技类型 → 中文（浮层里显示，比 raw 的 type 字段好读） */
export const TECH_TYPE_LABEL: Record<TechType, string> = {
  unlock: '解锁',
  qualitative: '质变',
  numeric: '数值',
  gate: '门槛',
};
