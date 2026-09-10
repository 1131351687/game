// 岗位分配：每行一个岗位，显示人数与产出，提供 -10/-1/+1/+10/Max 分配控件
import { useStore, toEngineState } from '../../state/store';
import { JOBS, type JobDef } from '../../data/jobs';
import { RESOURCE_MAP } from '../../data/resources';
import { TECH_MAP } from '../../data/techs';
import { TOOL_TIERS } from '../../data/constants';
import {
  calcJobOutput,
  getAssignedPopulation,
  getIdlePopulation,
  isJobUnlocked,
} from '../../game/engine';
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

export function JobPanel() {
  const state = useStore();
  const view = toEngineState(state);
  const { setJobCount, assignAllIdle, clearJobs } = state;

  const idle = Math.floor(getIdlePopulation(view));
  const assigned = getAssignedPopulation(view);
  const total = state.population;

  const btn =
    'rounded px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:bg-gray-900 disabled:text-gray-700';
  const btnNormal = 'bg-gray-700 text-gray-200 hover:bg-gray-600';

  return (
    <section className="space-y-2">
      <header className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">👥 岗位分配</h2>
        <button
          type="button"
          onClick={clearJobs}
          disabled={assigned <= 0}
          className={`rounded px-2 py-1 text-xs transition-colors ${
            assigned <= 0
              ? 'cursor-not-allowed bg-gray-800 text-gray-600'
              : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
          }`}
        >
          清空分配
        </button>
      </header>

      {/* 顶部：空闲人口 / 总人口 */}
      <div className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm">
        <span className="text-gray-400">空闲人口</span>{' '}
        <span
          className={`font-semibold tabular-nums ${idle > 0 ? 'text-amber-400' : 'text-gray-400'}`}
        >
          {idle}
        </span>
        <span className="mx-1 text-gray-600">/</span>
        <span className="text-gray-400">总人口</span>{' '}
        <span className="font-semibold tabular-nums text-gray-200">
          {formatNumber(total, 0)}
        </span>
        <span className="ml-2 text-xs text-gray-500">
          在岗 {formatNumber(assigned, 0)}
        </span>
      </div>

      {/* ── 人力分配一览（横条图，相对已分配总数）── */}
      <div className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-wide text-gray-500">人力分配一览</span>
          <span className="text-[11px] tabular-nums text-gray-500">
            {assigned > 0 ? `${formatNumber(assigned, 0)} 人在岗` : '尚无人分配'}
          </span>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-900">
          {JOBS.map(job => {
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
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {JOBS.map(job => {
            const count = state.jobs[job.id] ?? 0;
            const pct = assigned > 0 ? (count / assigned) * 100 : 0;
            return (
              <span key={job.id} className="flex items-center gap-1 text-[11px] text-gray-500">
                <span className={`inline-block h-2 w-2 rounded-sm ${JOB_BAR[job.id] ?? 'bg-gray-600'}`} />
                {job.icon} {job.name} {pct.toFixed(0)}%
              </span>
            );
          })}
        </div>
      </div>

      {/* ── 岗位列表 ── */}
      {JOBS.map(job => {
        const count = state.jobs[job.id] ?? 0;
        const unlocked = isJobUnlocked(job.id, view);
        const output = calcJobOutput(job.id, view);
        const outDef = RESOURCE_MAP[job.output];

        return (
          <div
            key={job.id}
            className={`rounded-lg border px-3 py-2 ${
              unlocked ? 'border-gray-700 bg-gray-800' : 'border-gray-800 bg-gray-800/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className={`flex min-w-0 items-center gap-2 ${unlocked ? '' : 'opacity-50'}`}>
                <span className="text-lg leading-none">{job.icon}</span>
                <div className="min-w-0">
                  <div className="truncate text-sm text-gray-300">
                    {job.name}
                    <span className="ml-2 tabular-nums text-xs text-gray-500">
                      {count} 人
                    </span>
                  </div>
                  <div className="truncate text-[11px] text-gray-500">{job.desc}</div>
                </div>
              </div>

              <div className="shrink-0 text-right">
                {unlocked ? (
                  <>
                    <div className="text-sm font-semibold tabular-nums text-green-400">
                      {outDef.icon} {formatRate(output)}/秒
                    </div>
                    <div className="text-[11px] tabular-nums text-gray-500">
                      每人 {formatRate(job.outputRate)}/秒
                    </div>
                  </>
                ) : (
                  <span className="text-[11px] text-gray-500">🔒 未解锁</span>
                )}
              </div>
            </div>

            {unlocked ? (
              <div className="mt-2 flex flex-wrap gap-1">
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
                  className={`${btn} ${idle > 0 ? 'bg-blue-600 text-white hover:bg-blue-500' : ''}`}
                  disabled={idle <= 0}
                  onClick={() => assignAllIdle(job.id)}
                >
                  Max
                </button>
              </div>
            ) : (
              <div className="mt-1.5 rounded bg-gray-900/60 px-2 py-1 text-[11px] text-gray-500">
                {unlockHint(job)}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

// App.tsx 目前以默认导入引用本组件，这里保留默认导出以兼容两种写法
export default JobPanel;
