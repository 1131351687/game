// 开局极简视图 —— 尚未掌握火之前的唯一界面
//
// 设计约束：可点元素不超过 10 个（当前为 4 个）
//   1) 采集者 +1   2) 采集者 +10   3) 采集者 全部   4) 科技节点「掌握火」
//
// 目的：玩家第一眼就明白「派人采集 → 攒经验 → 点亮科技」这一条主线，
//       不被尚未解锁的模块干扰。

import { useStore, toEngineState } from '../../state/store';
import { TechTree } from './TechTree';
import { getRevealedJobs, getOpeningHint } from '../../game/reveal';
import { calcJobOutput, getIdlePopulation, calcExperienceOutput } from '../../game/engine';
import { RESOURCE_MAP } from '../../data/resources';
import { formatNumber, formatRate } from '../../core/format';

export function OpeningView() {
  const s = useStore();
  const view = toEngineState(s);
  const hint = getOpeningHint(view);
  const jobs = getRevealedJobs(view);
  const idle = getIdlePopulation(view);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* 极简资源条 —— 只显示开局相关的三项 */}
      <div className="flex items-center gap-6 px-4 py-3 bg-gray-800 border-b border-gray-700 text-sm">
        <span className="flex items-center gap-1.5">
          <span>{RESOURCE_MAP.food.icon}</span>
          <span className="text-gray-400">食物</span>
          <span className="font-mono text-white">{formatNumber(s.food)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span>{RESOURCE_MAP.experience.icon}</span>
          <span className="text-gray-400">经验</span>
          <span className="font-mono text-white">{formatNumber(s.experience)}</span>
          <span className="text-xs text-green-400">{formatRate(calcExperienceOutput(view))}/秒</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span>{RESOURCE_MAP.population.icon}</span>
          <span className="text-gray-400">人口</span>
          <span className="font-mono text-white">{Math.floor(s.population)}</span>
          <span className="text-xs text-gray-500">
            （空闲 {idle}）
          </span>
        </span>
      </div>

      <div className="p-4 space-y-5 max-w-3xl">
        {/* 引导文案 */}
        {hint && (
          <div className="px-4 py-3 rounded bg-blue-950/60 border border-blue-800 text-blue-200 text-sm">
            {hint}
          </div>
        )}

        {/* 唯一的岗位：采集者 */}
        <section>
          <h2 className="text-sm text-gray-400 mb-2">族人分工</h2>
          {jobs.map(job => {
            const count = s.jobs[job.id] ?? 0;
            const output = calcJobOutput(job.id, view);
            return (
              <div
                key={job.id}
                className="flex items-center justify-between px-4 py-3 bg-gray-800 rounded"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{job.icon}</span>
                  <div>
                    <div className="font-medium">{job.name}</div>
                    <div className="text-xs text-gray-400">
                      {count} 人 · 产出 {formatRate(output)} 食物/秒
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => s.setJobCount(job.id, count + 1)}
                    disabled={idle < 1}
                    className="px-3 py-1.5 text-sm rounded bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
                  >
                    +1
                  </button>
                  <button
                    onClick={() => s.setJobCount(job.id, count + 10)}
                    disabled={idle < 1}
                    className="px-3 py-1.5 text-sm rounded bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
                  >
                    +10
                  </button>
                  <button
                    onClick={() => s.assignAllIdle(job.id)}
                    disabled={idle < 1}
                    className="px-3 py-1.5 text-sm rounded bg-green-800 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
                  >
                    全部
                  </button>
                </div>
              </div>
            );
          })}
        </section>

        {/* 科技树 —— 开局只会有「掌握火」一个节点（其余由 reveal 规则隐藏） */}
        <section className="flex-1 min-h-[420px]">
          <TechTree />
        </section>
      </div>
    </div>
  );
}
