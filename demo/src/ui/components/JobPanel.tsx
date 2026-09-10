// 工作页（独立 Tab）· 岗位分配
//
// 布局约定（配合 App.tsx 的 Tab 结构）：
//   1. 外层已由 App.tsx 提供 `mx-auto max-w-4xl`，本组件不再套外层容器
//   2. 资源总量常驻顶部 TopBar —— 这里只显示「速率」与「成本」，不重复显示存量
//   3. MessageLog 是 `fixed bottom-0`（约 160px），最外层 pb-40 防止末尾元素被遮挡
//
// 渐进解锁：未达条件的岗位**不显示**（getRevealedJobs 过滤）；
// 唯一例外是「前置科技已研究、但工具世代还没到」的岗位（猎人）：
// 它会被 reveal 出来但尚未解锁，此时灰化显示并提示缺什么。

import { useStore, toEngineState } from '../../state/store';
import {
  calcJobOutput,
  getAssignedPopulation,
  getIdlePopulation,
  isJobUnlocked,
  type E1State,
} from '../../game/engine';
import { getRevealedJobs } from '../../game/reveal';
import type { JobDef } from '../../data/jobs';
import { RESOURCE_MAP } from '../../data/resources';
import { TECH_MAP } from '../../data/techs';
import { TOOL_TIERS } from '../../data/constants';
import { formatNumber, formatRate } from '../../core/format';

/** 人力分配一览的横条颜色（每个岗位一色） */
const JOB_BAR: Record<string, string> = {
  gatherer: 'bg-green-500',
  woodcutter: 'bg-amber-500',
  knapper: 'bg-slate-400',
  hunter: 'bg-rose-500',
};

/** 未解锁时的原因文案（来自 JOBS[].requires） */
function unlockHint(job: JobDef): string {
  const parts: string[] = [];
  const techId = job.requires.tech;
  const tierLevel = job.requires.toolTier;

  if (techId) {
    parts.push(`需要科技：${TECH_MAP[techId]?.name ?? techId}`);
  }
  if (tierLevel !== undefined) {
    const tier = TOOL_TIERS.find(t => t.level === tierLevel);
    parts.push(`需要工具世代：${tier?.name ?? `Lv.${tierLevel}`}`);
  }
  return parts.length > 0 ? parts.join(' · ') : '无条件';
}

/**
 * 计算「每人每秒」的产出速率。
 *
 * - 已派人：直接用引擎算出的总产出 / 人数（含所有倍率，真实人均）
 * - 未派人：把该岗位临时设为 1 人再问引擎（预估人均，供玩家判断收益）
 *
 * 不自己重算倍率，避免与 engine 的规则漂移。
 */
function perPersonRate(job: JobDef, view: E1State, count: number): number {
  if (count > 0) return calcJobOutput(job.id, view) / count;
  return calcJobOutput(job.id, { ...view, jobs: { ...view.jobs, [job.id]: 1 } });
}

export function JobPanel() {
  const state = useStore();
  const view = toEngineState(state);
  const { setJobCount, assignAllIdle, clearJobs } = state;

  const jobs = getRevealedJobs(view);
  const idle = Math.floor(getIdlePopulation(view));
  const assigned = getAssignedPopulation(view);
  const total = state.population;

  const btn =
    'rounded px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:bg-gray-900 disabled:text-gray-700';
  const btnNormal = 'bg-gray-700 text-gray-200 hover:bg-gray-600';

  return (
    // pb-40：给 fixed bottom-0 的 MessageLog 让位
    <section className="space-y-3 pb-40">
      <header className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">👥 岗位分配</h2>
        <button
          type="button"
          onClick={clearJobs}
          disabled={assigned <= 0}
          className={`rounded px-2.5 py-1 text-xs transition-colors ${
            assigned <= 0
              ? 'cursor-not-allowed bg-gray-800 text-gray-600'
              : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
          }`}
        >
          清空分配
        </button>
      </header>

      {/* 顶部：空闲人口 / 总人口 */}
      <div className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-sm">
        <span className="text-gray-400">空闲人口</span>{' '}
        <span
          className={`text-lg font-semibold tabular-nums ${
            idle > 0 ? 'text-amber-400' : 'text-gray-400'
          }`}
        >
          {idle}
        </span>
        <span className="mx-1 text-gray-600">/</span>
        <span className="text-gray-400">总人口</span>{' '}
        <span className="text-lg font-semibold tabular-nums text-gray-200">
          {formatNumber(total, 0)}
        </span>
        <span className="ml-3 text-xs text-gray-500">在岗 {formatNumber(assigned, 0)}</span>
      </div>

      {/* ── 人力分配一览（横条图，相对已分配总数）── */}
      <div className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-3">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-wide text-gray-500">人力分配一览</span>
          <span className="text-[11px] tabular-nums text-gray-500">
            {assigned > 0 ? `${formatNumber(assigned, 0)} 人在岗` : '尚无人分配'}
          </span>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-900">
          {jobs.map(job => {
            const count = state.jobs[job.id] ?? 0;
            const pct = assigned > 0 ? (count / assigned) * 100 : 0;
            if (pct <= 0) return null;
            return (
              <div
                key={job.id}
                className={`h-full ${JOB_BAR[job.id] ?? 'bg-gray-600'}`}
                style={{ width: `${pct}%` }}
                title={`${job.name} ${count} 人（${pct.toFixed(0)}%）`}
              />
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {jobs.map(job => {
            const count = state.jobs[job.id] ?? 0;
            const pct = assigned > 0 ? (count / assigned) * 100 : 0;
            return (
              <span key={job.id} className="flex items-center gap-1 text-[11px] text-gray-500">
                <span
                  className={`inline-block h-2 w-2 rounded-sm ${JOB_BAR[job.id] ?? 'bg-gray-600'}`}
                />
                {job.icon} {job.name} {count} 人 · {pct.toFixed(0)}%
              </span>
            );
          })}
        </div>
      </div>

      {/* ── 岗位列表 ── */}
      {jobs.length === 0 ? (
        // 理论上不会出现（采集者始终可见），仅作兜底
        <div className="rounded-lg border border-dashed border-gray-700 bg-gray-800/50 px-4 py-8 text-center text-sm text-gray-500">
          暂无可用岗位 —— 继续研究科技以解锁新的生产方式。
        </div>
      ) : (
        jobs.map(job => {
          const count = state.jobs[job.id] ?? 0;
          const unlocked = isJobUnlocked(job.id, view);
          const output = calcJobOutput(job.id, view);
          const per = perPersonRate(job, view, count);
          const outDef = RESOURCE_MAP[job.output];

          return (
            <div
              key={job.id}
              className={`rounded-lg border px-4 py-3 ${
                unlocked ? 'border-gray-700 bg-gray-800' : 'border-gray-800 bg-gray-800/40'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                {/* 左：岗位名 + 当前人数 + 说明 */}
                <div className={`flex min-w-0 items-center gap-3 ${unlocked ? '' : 'opacity-50'}`}>
                  <span className="text-2xl leading-none">{job.icon}</span>
                  <div className="min-w-0">
                    {/* 明确显示「谁 · 几个人 → 每秒产出多少」 */}
                    <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-semibold text-gray-200">{job.name}</span>
                      <span className="tabular-nums text-gray-400">{count} 人</span>
                      {unlocked && (
                        <>
                          <span className="text-gray-600">→</span>
                          <span className="font-semibold tabular-nums text-green-400">
                            {formatRate(output)} {outDef.name}/秒
                          </span>
                        </>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-gray-500">{job.desc}</div>
                  </div>
                </div>

                {/* 右：速率明细 */}
                <div className="shrink-0 text-right">
                  {unlocked ? (
                    <>
                      <div className="text-xs tabular-nums text-gray-400">
                        {outDef.icon} 每人 {formatRate(per)}/秒
                      </div>
                      <div className="text-[11px] tabular-nums text-gray-500">
                        {count > 0 ? `${count} 人合计` : '尚未派人'}
                      </div>
                    </>
                  ) : (
                    <span className="text-[11px] text-gray-500">🔒 条件未满足</span>
                  )}
                </div>
              </div>

              {unlocked ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className={`${btn} ${count > 0 ? btnNormal : ''}`}
                    disabled={count <= 0}
                    onClick={() => setJobCount(job.id, count - 10)}
                  >
                    -10
                  </button>
                  <button
                    type="button"
                    className={`${btn} ${count > 0 ? btnNormal : ''}`}
                    disabled={count <= 0}
                    onClick={() => setJobCount(job.id, count - 1)}
                  >
                    -1
                  </button>
                  <button
                    type="button"
                    className={`${btn} ${idle > 0 ? btnNormal : ''}`}
                    disabled={idle <= 0}
                    onClick={() => setJobCount(job.id, count + 1)}
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    className={`${btn} ${idle > 0 ? btnNormal : ''}`}
                    disabled={idle <= 0}
                    onClick={() => setJobCount(job.id, count + 10)}
                  >
                    +10
                  </button>
                  <button
                    type="button"
                    className={`${btn} ${
                      idle > 0 ? 'bg-blue-600 text-white hover:bg-blue-500' : ''
                    }`}
                    disabled={idle <= 0}
                    onClick={() => assignAllIdle(job.id)}
                  >
                    Max
                  </button>
                </div>
              ) : (
                // 前置科技已研究但工具世代未到（猎人）：灰化 + 提示缺什么
                <div className="mt-2 rounded bg-gray-900/60 px-2.5 py-1.5 text-[11px] text-gray-400">
                  🔒 {unlockHint(job)}
                </div>
              )}
            </div>
          );
        })
      )}

      <p className="text-[11px] leading-relaxed text-gray-500">
        人口既是劳动力也是经验来源：人越多，经验积累越快；但每人每秒消耗 0.2 食物。
        分配时优先保证食物产出高于消耗。
      </p>
    </section>
  );
}

// App.tsx 目前以具名导入引用本组件，这里保留默认导出以兼容两种写法
export default JobPanel;
