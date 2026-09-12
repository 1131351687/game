// 刻录效果差量：把某科技（未刻录）的「口头 ×0.5」与「刻录后 ×1.0」效果差别算出来，
// 供 RecordPanel 每条可刻录科技行直观展示。
//
// 口径严格对齐 engine.aggregateEffects：
//   · 数值型（乘数 / 加数）按时代衰减后，再乘刻录口径（口头 0.5 / 已刻录 1.0）
//       mul(m) = 1 + (m-1)*k   add(v) = v*k   cur = *0.5   post = *1.0
//   · 绝对设置键（取最大/最小）与解锁/布尔键：不衰减、不受刻录影响 → 显示「全额」
//
// 数据来自 tech.effects 与 aggregateEffects 同套规则，不在 UI 复制常量。

import type { TechDef } from '../../data/techs';
import { JOB_MAP, type JobId } from '../../data/jobs';
import { RESOURCE_MAP, type ResourceId } from '../../data/resources';
import { BUILDING_MAP, type BuildingId } from '../../data/buildings';
import { eraDecay, eraDistance } from '../../data/era';
import type { E1State } from '../../game/engine';

type Kind = 'mul' | 'add' | 'set' | 'unlock';

/** 每个效果键的处理类别（与 aggregateEffects 的聚合方式一一对应） */
const KIND: Record<string, Kind> = {
  // 乘数键（1+(m-1)*k）
  fireDecayMultiplier: 'mul', foodMultiplier: 'mul', stoneMultiplier: 'mul', expMultiplier: 'mul',
  gathererMultiplier: 'mul', buildingCostMultiplier: 'mul', foodStorageMultiplier: 'mul',
  grainMultiplier: 'mul', livestockFoodMul: 'mul', summerHerderMul: 'mul', fieldYieldMul: 'mul',
  feedCostMultiplier: 'mul', villageHouseCostMul: 'mul', granaryCapacityMul: 'mul',
  jobSwitchCostMul: 'mul', scribeOutputMul: 'mul', contractBreachPenalty: 'mul',
  contractDurationMul: 'mul', landCaravanMul: 'mul', waterDistMul: 'mul',
  // 加数键（v*k）
  fireMaxBonus: 'add', stabilityBonus: 'add', huntPartyBonus: 'add',
  springAgriMul: 'add', summerAgriMul: 'add', autumnAgriMul: 'add', winterAgriMul: 'add',
  penCapacityAdd: 'add', granaryOverflowBonus: 'add', recordCapacityAdd: 'add',
  routeSlotsAdd: 'add', routeBreakChance: 'add',
  // 绝对设置键（取最大/最小，不衰减）
  setToolTier: 'set', huntPartyThreshold: 'set', livestockTier: 'set',
  livestockFamineSurvival: 'set', fieldEfficiencyCap: 'set', granaryPerUnit: 'set',
  kilnBonus: 'set', archiveBonus: 'set', scribesPerRoute: 'set', contractSlots: 'set',
  conversionLoss: 'set', recyclingRate: 'set', lossReduction: 'set',
  // 解锁/布尔键（不衰减）
  enableFire: 'unlock', activeFireRestore: 'unlock', removeWeakFoodPenalty: 'unlock',
  unlockJobs: 'unlock', unlockBuildings: 'unlock', unlockResources: 'unlock',
  enableAdvance: 'unlock', enableSeasons: 'unlock', removeCapacityCap: 'unlock',
  enableRecording: 'unlock', enableLapis: 'unlock',
  // jobMultiplier / resourceMultiplier 在循环里单独处理
};

/** 中文标签（覆盖全部键，缺省时回退到键名） */
const LABEL: Record<string, string> = {
  fireDecayMultiplier: '火种衰减', fireMaxBonus: '火种上限', foodMultiplier: '食物产出',
  stoneMultiplier: '石头产出', expMultiplier: '经验/知识产出', gathererMultiplier: '采集者效率',
  buildingCostMultiplier: '建筑成本', foodStorageMultiplier: '食物存储', grainMultiplier: '谷物产出',
  livestockFoodMul: '牲畜食物', summerHerderMul: '夏季牧人', fieldYieldMul: '田地产出',
  feedCostMultiplier: '饲料成本', villageHouseCostMul: '村落民居成本', granaryCapacityMul: '粮仓容量',
  jobSwitchCostMul: '岗位切换成本', scribeOutputMul: '书吏产出', contractBreachPenalty: '违约惩罚',
  contractDurationMul: '契约时长', landCaravanMul: '陆路运力', waterDistMul: '水路距离',
  stabilityBonus: '社会稳定性', huntPartyBonus: '集体围猎加成', penCapacityAdd: '畜栏存栏',
  granaryOverflowBonus: '粮仓溢出', recordCapacityAdd: '记录容量', routeSlotsAdd: '贸易路线槽',
  routeBreakChance: '路线中断概率', springAgriMul: '春播', summerAgriMul: '夏长',
  autumnAgriMul: '秋收', winterAgriMul: '冬藏',
  setToolTier: '工具世代', huntPartyThreshold: '围猎阈值', livestockTier: '牲畜世代',
  livestockFamineSurvival: '饥荒存活率', fieldEfficiencyCap: '田地效率上限',
  granaryPerUnit: '粮仓单座容量', kilnBonus: '陶窑容量', archiveBonus: '档案加成',
  scribesPerRoute: '每路线书吏', contractSlots: '契约槽', conversionLoss: '换算损耗',
  recyclingRate: '青铜回收率', lossReduction: '损失减幅',
  enableFire: '开启火种', activeFireRestore: '主动补火', removeWeakFoodPenalty: '取消弱火食物惩罚',
  unlockJobs: '解锁岗位', unlockBuildings: '解锁建筑', unlockResources: '解锁资源',
  enableAdvance: '解锁时代跃迁', enableSeasons: '开启季节', removeCapacityCap: '取消承载力硬顶',
  enableRecording: '开启记录/刻录', enableLapis: '解锁青金石',
};

/** 解锁数组键 → 名称解析 */
function resolveNames(key: string, ids: string[]): string {
  if (key === 'unlockJobs') return ids.map(id => JOB_MAP[id as JobId]?.name ?? id).join('、');
  if (key === 'unlockBuildings') return ids.map(id => BUILDING_MAP[id as BuildingId]?.name ?? id).join('、');
  if (key === 'unlockResources') return ids.map(id => RESOURCE_MAP[id as ResourceId]?.name ?? id).join('、');
  return ids.join('、');
}

/**
 * 返回某科技的数值效果「口头 → 刻录后」差量描述行。
 * 没有数值型效果（纯解锁/布尔科技）时，返回的是「全额生效」类说明行。
 */
export function buildRecordDelta(tech: TechDef, view: E1State): string[] {
  const k = eraDecay(eraDistance(tech.era, view.era));
  const mul = (m: number) => 1 + (m - 1) * k;
  const add = (v: number) => v * k;
  const oral = 0.5;
  const lines: string[] = [];
  const e = tech.effects;

  const pushNum = (label: string, kind: 'mul' | 'add', base: number) => {
    if (kind === 'mul') {
      const post = mul(base);
      const cur = post * oral;
      lines.push(`${label}：当前 ×${cur.toFixed(2)}（口头）→ 刻录后 ×${post.toFixed(2)}`);
    } else {
      const post = add(base);
      const cur = post * oral;
      lines.push(`${label}：当前 +${cur.toFixed(2)}（口头）→ 刻录后 +${post.toFixed(2)}`);
    }
  };

  for (const [key, val] of Object.entries(e)) {
    if (val === undefined) continue;

    if (key === 'jobMultiplier') {
      for (const [job, m] of Object.entries(val as Record<string, number>)) {
        if (m === undefined) continue;
        pushNum(`岗位·${JOB_MAP[job as JobId]?.name ?? job}产出`, 'mul', m);
      }
      continue;
    }
    if (key === 'resourceMultiplier') {
      for (const [res, m] of Object.entries(val as Record<string, number>)) {
        if (m === undefined) continue;
        pushNum(`资源·${RESOURCE_MAP[res as ResourceId]?.name ?? res}产出`, 'mul', m);
      }
      continue;
    }

    const kind = KIND[key];
    if (kind === 'mul') {
      pushNum(LABEL[key] ?? key, 'mul', val as number);
    } else if (kind === 'add') {
      pushNum(LABEL[key] ?? key, 'add', val as number);
    } else if (kind === 'set') {
      lines.push(`${LABEL[key] ?? key}：当前值 ${String(val)}（绝对设置·全额生效）`);
    } else if (kind === 'unlock') {
      if (key === 'unlockJobs' || key === 'unlockBuildings' || key === 'unlockResources') {
        const names = resolveNames(key, val as string[]);
        if (names) lines.push(`${LABEL[key] ?? key}：${names}（解锁·全额生效）`);
      } else {
        lines.push(`${LABEL[key] ?? key}（解锁/启用·全额生效）`);
      }
    }
  }

  return lines;
}
