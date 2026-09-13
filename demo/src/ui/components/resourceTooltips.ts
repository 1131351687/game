// 资源悬浮提示工具：产出来源 + 储量上限来源
//
// 两处复用（AppResponsiveB 的 ResourceList 与 TopBar），数据自己组装，
// 用原生 title 属性（多行 \n）即可，简单可靠。
//
// 产出来源：遍历 JOBS，凡是 output===该资源的岗位，显示「岗位名 ×人数 → 速率/s」
//          （速率用 calcJobOutput 实时算）；经验资源额外显示 calcExperienceOutput 合计。
// 储量来源：用 getStorageBreakdown(id, view) 逐行「label：amount」，空数组显示「无上限」。

import { JOBS, type JobId } from '../../data/jobs';
import type { ResourceId } from '../../data/resources';
import { eraDistance } from '../../data/era';
import { calcJobOutput, calcExperienceOutput, getStorageBreakdown, type E1State } from '../../game/engine';
import { getLocalOreLabel } from '../../game/reveal';
import { formatRate, formatNumber } from '../../core/format';

/** 单个岗位的产出行：岗位名 ×人数 → 速率/s */
function jobLine(jobId: JobId, view: E1State): string {
  const job = JOBS.find(j => j.id === jobId);
  if (!job) return '';
  const n = view.jobs[jobId] ?? 0;
  return `${job.name} ×${n} → ${formatRate(calcJobOutput(jobId, view))}/秒`;
}

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

  // E3 金属矿脉门控：铜/锡是否有本地产出取决于 localOre，
  // 提示必须把这一点说明白——否则"雇了矿工没产量"会被当成 bug。
  if (eraDistance('E3', view.era) >= 0 && (id === 'copper' || id === 'tin')) {
    const lines = [`本地矿藏：${getLocalOreLabel(view)}`];
    if (view.localOre === 'copper') {
      lines.push(
        id === 'copper'
          ? jobLine('copper_miner', view)
          : '锡无本地产出 —— 需与迪尔蒙贸易进口'
      );
    } else if (view.localOre === 'tin') {
      lines.push(
        id === 'tin'
          ? `${jobLine('copper_miner', view)} ×0.5（矿工转采锡）`
          : '铜无本地产出 —— 需与埃兰/玛甘贸易进口'
      );
    } else {
      lines.push('无本地金属矿 —— 铜/锡均需贸易进口');
    }
    return lines.join('\n');
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
