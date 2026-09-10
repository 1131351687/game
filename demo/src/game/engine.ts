// 游戏引擎 - 资源产出与岗位计算
// 放置游戏核心：sqrt 递减收益，防止后期数值爆炸

import { useStore } from '../state/store';

// 岗位定义
export const JOB_DEFS = {
  farmer: { input: 'manpower', inputCost: 1, output: 'food', outputRate: 0.5 },
  lumberjack: { input: 'manpower', inputCost: 1, output: 'wood', outputRate: 0.5 },
  miner: { input: 'manpower', inputCost: 1, output: 'stone', outputRate: 0.4 },
  scientist: { input: 'manpower', inputCost: 2, output: 'research', outputRate: 0.1 },
} as const;

// 政府加成
export const GOVERNMENTS = {
  none: { name: '原始部落', economy: 1.0, research: 1.0, military: 0 },
  democracy: { name: '民主', economy: 1.0, research: 1.5, military: 0.5 },
  empire: { name: '帝国', economy: 1.5, research: 1.0, military: 2.0 },
} as const;

// 计算岗位产出（sqrt 递减收益）
export function calcJobOutput(jobId: string, count: number): number {
  const def = JOB_DEFS[jobId as keyof typeof JOB_DEFS];
  if (!def || count <= 0) return 0;
  return Math.sqrt(count) * def.outputRate;
}

// 计算某个资源的总产出/秒
export function calcResourceOutput(resourceId: string): number {
  const state = useStore.getState();

  // 找到产出这个资源的所有岗位
  let output = 0;
  for (const [jobId, job] of Object.entries(state.jobs)) {
    const def = JOB_DEFS[jobId as keyof typeof JOB_DEFS];
    if (!def) continue;
    if (def.output === resourceId) {
      output += calcJobOutput(jobId, job.count);
    }
  }

  // 政府加成
  const gov = GOVERNMENTS[state.government.regime as keyof typeof GOVERNMENTS];
  if (resourceId === 'research') output *= gov.research;
  else output *= gov.economy;

  // 科技加成
  if (state.techs['production_boost']?.unlocked) output *= 1.5;

  // 重置加成（每个重置点 +5%）
  output *= 1 + state.prestige.points * 0.05;

  return output;
}

// 更新所有资源产出（每 fastLoop 调用一次）
export function updateAllOutputs(): void {
  const state = useStore.getState();
  const newResources = { ...state.resources };

  for (const id of Object.keys(newResources)) {
    const newOutput = calcResourceOutput(id);
    newResources[id] = { ...newResources[id], outputPerSecond: newOutput };
  }

  useStore.setState({ resources: newResources });
}

// 更新游戏状态（被 fastLoop 调用）
export function tickGame(dt: number): void {
  const state = useStore.getState();
  if (state.settings.pause) return;

  // 更新资源累积
  const newResources = { ...state.resources };
  for (const [id, res] of Object.entries(newResources)) {
    if (!res.unlocked) continue;
    const newCount = Math.min(res.count + res.outputPerSecond * dt, res.storage);
    newResources[id] = { ...res, count: newCount };

    // 累计统计
    if (id === 'food') {
      useStore.setState(s => ({
        stats: { ...s.stats, totalFood: s.stats.totalFood + (newCount - res.count) },
      }));
    }
    if (id === 'research') {
      useStore.setState(s => ({
        stats: { ...s.stats, totalResearch: s.stats.totalResearch + (newCount - res.count) },
      }));
    }
  }

  useStore.setState({ resources: newResources });
}

// 格式化数字（K/M/B/T）
const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

export function formatNumber(n: number, decimals = 1): string {
  if (n === 0) return '0';
  if (n < 0) return '-' + formatNumber(-n, decimals);
  if (n < 1) return n.toFixed(decimals);

  const magnitude = Math.floor(Math.log10(n));
  const idx = Math.floor(magnitude / 3);

  if (idx >= SUFFIXES.length) return n.toExponential(decimals);

  const suffix = SUFFIXES[idx];
  const scaled = n / Math.pow(1000, idx);
  return `${scaled.toFixed(decimals)}${suffix}`;
}

// 格式化时间
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
