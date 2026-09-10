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
//
// 视觉简约化：岗位行改为无边框列表项（hover:bg-gray-800/50 区分），
// 标题小号灰淡，按钮轻量化（小号、无边框、hover 才显色）。
// 全组件间距统一：区块间 space-y-4，区块内 space-y-2。
//
// 纯文字模式：所有 emoji 走 <Icon>；图标可能渲染为 null，
// 因此所有含图标的行都用 flex + gap 排布，不依赖图标宽度。

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
import { Icon } from './Icon';

/** 人力分配一览的横条颜色（每个岗位一色 —— 这是数据编码，唯一保留的彩色区） */
const JOB_BAR: Record<string, string> = {
  gatherer: 'bg-green-500/70',
  woodcutter: 'bg-amber-500/70',
  knapper: 'bg-slate-400/70',
  hunter: 'bg-rose-500/70',
  // ── E2 定居时代 ──
  farmer: 'bg-lime-500/70',
  herder: 'bg-orange-400/70',
  weaver: 'bg-violet-400/70',
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

/** 小号无边框按钮：默认灰淡，hover 才显色；禁用时进一步压暗 */
const BTN =
  'rounded-md px-2 py-0.5 text-xs tabular-nums text-gray-500 transition-colors hover:bg-gray-800/70 hover:text-gray-200 disabled:cursor-not-allowed disabled:text-gray-700 disabled:hover:bg-transparent';

/** 小号区块标题：小号化 + 灰淡化 */
const SECTION_TITLE = 'text-xs uppercase tracking-wide text-gray-500';

export function JobPanel() {
  const state = useStore();
  const view = toEngineState(state);
  const { setJobCount, assignAllIdle, clearJobs } = state;

  const jobs = getRevealedJobs(view);
  const idle = Math.floor(getIdlePopulation(view));
  const assigned = getAssignedPopulation(view);
  const total = state.population;

  return (
    // pb-40：给 fixed bottom-0 的 MessageLog 让位
    <section className="space-y-4 pb-40">
      <header className="flex items-center justify-between">
        <h2 className={`flex items-center gap-1.5 ${SECTION_TITLE}`}>
          <Icon emoji="👥" className="text-xs" />
          <span>岗位分配</span>
        </h2>
        <button
          type="button"
          onClick={clearJobs}
          disabled={assigned <= 0}
          className={`rounded-md px-2 py-0.5 text-xs transition-colors ${
            assigned <= 0
              ? 'cursor-not-allowed text-gray-700'
              : 'text-gray-500 hover:bg-gray-800/70 hover:text-gray-200'
          }`}
        >
          清空分配
        </button>
      </header>

      {/* 顶部：空闲人口 / 总人口 —— 无边框，靠留白与字重分层 */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xs text-gray-500">空闲人口</span>
        <span
          className={`text-lg font-semibold tabular-nums ${
            idle > 0 ? 'text-amber-400' : 'text-gray-500'
          }`}
        >
          {idle}
        </span>
        <span className="text-gray-700">/</span>
        <span className="text-xs text-gray-500">总人口</span>
        <span className="text-lg font-semibold tabular-nums text-gray-200">
          {formatNumber(total, 0)}
        </span>
        <span className="text-xs tabular-nums text-gray-600">
          在岗 {formatNumber(assigned, 0)}
        </span>
      </div>

      {/* ── 人力分配一览（横条图，相对已分配总数）── */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className={SECTION_TITLE}>人力分配一览</span>
          <span className="text-xs tabular-nums text-gray-600">
            {assigned > 0 ? `${formatNumber(assigned, 0)} 人在岗` : '尚无人分配'}
          </span>
        </div>
        <div className="flex h-2.5 w-full overflow-hidden rounded-md bg-gray-800/60">
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
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {jobs.map(job => {
            const count = state.jobs[job.id] ?? 0;
            const pct = assigned > 0 ? (count / assigned) * 100 : 0;
            return (
              <span
                key={job.id}
                className="flex items-center gap-1 text-xs tabular-nums text-gray-600"
              >
                <span
                  className={`inline-block h-2 w-2 shrink-0 rounded-sm ${JOB_BAR[job.id] ?? 'bg-gray-600'}`}
                />
                <Icon emoji={job.icon} className="text-xs" />
                <span>
                  {job.name} {count} 人 · {pct.toFixed(0)}%
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* ── 岗位列表（无边框列表项）── */}
      <div className="space-y-2">
        {jobs.length === 0 ? (
          // 理论上不会出现（采集者始终可见），仅作兜底
          <div className="rounded-md bg-gray-800/40 px-4 py-8 text-center text-sm text-gray-500">
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
                className={`space-y-2 rounded-md px-4 py-3 transition-colors ${
                  unlocked ? 'hover:bg-gray-800/50' : 'bg-gray-800/20'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  {/* 左：岗位名 + 当前人数 + 说明 */}
                  <div className={`flex min-w-0 items-center gap-3 ${unlocked ? '' : 'opacity-50'}`}>
                    <Icon emoji={job.icon} className="text-xl leading-none" />
                    <div className="min-w-0">
                      {/* 明确显示「谁 · 几个人 → 每秒产出多少」 */}
                      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span className="font-medium text-gray-100">{job.name}</span>
                        <span className="tabular-nums text-gray-500">{count} 人</span>
                        {unlocked && (
                          <>
                            <span className="text-gray-700">→</span>
                            <span className="tabular-nums text-gray-300">
                              {formatRate(output)} {outDef.name}/秒
                            </span>
                          </>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-gray-600">{job.desc}</div>
                    </div>
                  </div>

                  {/* 右：速率明细 */}
                  <div className="shrink-0 text-right">
                    {unlocked ? (
                      <>
                        <div className="flex items-center justify-end gap-1 text-xs tabular-nums text-gray-500">
                          <Icon emoji={outDef.icon} className="text-xs" />
                          <span>每人 {formatRate(per)}/秒</span>
                        </div>
                        <div className="text-xs tabular-nums text-gray-600">
                          {count > 0 ? `${count} 人合计` : '尚未派人'}
                        </div>
                      </>
                    ) : (
                      <span className="flex items-center justify-end gap-1 text-xs text-gray-600">
                        <Icon emoji="🔒" className="text-xs" />
                        <span>条件未满足</span>
                      </span>
                    )}
                  </div>
                </div>

                {unlocked ? (
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className={BTN}
                      disabled={count <= 0}
                      onClick={() => setJobCount(job.id, count - 10)}
                    >
                      -10
                    </button>
                    <button
                      type="button"
                      className={BTN}
                      disabled={count <= 0}
                      onClick={() => setJobCount(job.id, count - 1)}
                    >
                      -1
                    </button>
                    <button
                      type="button"
                      className={BTN}
                      disabled={idle <= 0}
                      onClick={() => setJobCount(job.id, count + 1)}
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      className={BTN}
                      disabled={idle <= 0}
                      onClick={() => setJobCount(job.id, count + 10)}
                    >
                      +10
                    </button>
                    {/* Max 是主操作：空闲人口 > 0 时用色标记「可点击」 */}
                    <button
                      type="button"
                      className={`rounded-md px-2 py-0.5 text-xs transition-colors ${
                        idle > 0
                          ? 'text-emerald-400 hover:bg-emerald-500/10'
                          : 'cursor-not-allowed text-gray-700'
                      }`}
                      disabled={idle <= 0}
                      onClick={() => assignAllIdle(job.id)}
                    >
                      Max
                    </button>
                  </div>
                ) : (
                  // 前置科技已研究但工具世代未到（猎人）：灰化 + 提示缺什么
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Icon emoji="🔒" className="text-xs" />
                    <span>{unlockHint(job)}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="text-xs leading-relaxed text-gray-600">
        人口既是劳动力也是经验来源：人越多，经验积累越快；
        {state.era === 'E1' ? (
          <>但每人每秒消耗 0.2 食物。分配时优先保证食物产出高于消耗。</>
        ) : (
          <>
            但每人每秒消耗 0.25 谷物（牲畜另耗饲料）—— 定居时代的关键是<strong>秋季多下田</strong>，
            在入冬前把粮仓攒到冬耗之上。
          </>
        )}
      </p>
    </section>
  );
}

// App.tsx 目前以具名导入引用本组件，这里保留默认导出以兼容两种写法
export default JobPanel;
