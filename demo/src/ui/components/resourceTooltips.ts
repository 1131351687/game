// 资源悬浮提示工具：产出来源 + 储量上限来源
//
// 两处复用（AppResponsiveB 的 ResourceList 与 TopBar），数据自己组装，
// 用原生 title 属性（多行 \n）即可，简单可靠。
//
// 产出来源：遍历 JOBS，凡是 output===该资源的岗位，显示「岗位名 ×人数 → 速率/s」
//          （速率用 calcJobOutput 实时算）；经验资源额外显示 calcExperienceOutput 合计。
// 储量来源：用 getStorageBreakdown(id, view) 逐行「label：amount」，空数组显示「无上限」。

import { JOBS } from '../../data/jobs';
import type { ResourceId } from '../../data/resources';
import { eraDistance } from '../../data/era';
import { calcJobOutput, calcResourceOutput, calcExperienceOutput, getStorageBreakdown, type E1State } from '../../game/engine';
import { formatRate, formatNumber } from '../../core/format';

/** 悬浮在「资源名称/图标」上：产出来源与加成 */
export function buildOutputTitle(id: ResourceId, view: E1State): string {
  if (id === 'experience') {
    const lines = ['经验/知识产出来源：'];
    for (const job of JOBS) {
      if (job.output !== 'experience') continue;
      const n = view.jobs[job.id] ?? 0;
      lines.push(`${job.name} ×${n} → ${formatRate(calcJobOutput(job.id, view))}/秒`);
    }
    lines.push(`合计产出 → ${formatRate(calcExperienceOutput(view))}/秒`);
    return lines.join('\n');
  }

  // E3 金属：矿工产出由科技链驱动（铜矿开采→铜 / 锡矿开采→锡 / 深井采矿→加成）。
  // 速率直接取引擎口径（含时代衰减、口头折算、深井乘数），与实际入账一致。
  if (eraDistance('E3', view.era) >= 0 && (id === 'copper' || id === 'tin')) {
    const miners = view.jobs.miner ?? 0;
    const techId = id === 'copper' ? 'copper_mining' : 'tin_mining';
    const techName = id === 'copper' ? '铜矿开采' : '锡矿开采';
    if (miners <= 0) {
      return `暂无矿工 —— 研究「${techName}」解锁矿工后开始产出${id === 'copper' ? '铜' : '锡'}`;
    }
    if (!view.techs[techId]) {
      return `矿工 ×${miners}（研究「${techName}」后开始产出${id === 'copper' ? '铜' : '锡'}）`;
    }
    const rate = calcResourceOutput(id, view);
    return `${id === 'copper' ? '铜矿开采' : '锡矿开采'}：矿工 ×${miners} → ${formatRate(rate)}/秒`;
  }

  const jobs = JOBS.filter(j => j.output === id);
  if (jobs.length === 0) return '无产出岗位';
  return jobs
    .map(j => {
      const n = view.jobs[j.id] ?? 0;
      return `${j.name} ×${n} → ${formatRate(calcJobOutput(j.id, view))}/秒`;
    })
    .join('\n');
}

/** 悬浮在「资源数量」上：储量上限来源 */
export function buildStorageTitle(id: ResourceId, view: E1State): string {
  const bd = getStorageBreakdown(id, view);
  if (bd.length === 0) return '无上限';
  return bd.map(b => `${b.label}：${formatNumber(b.amount, 0)}`).join('\n');
}
