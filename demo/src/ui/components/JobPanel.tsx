// 工作页（独立 Tab）· 岗位分配
//
// 2026-09-13 改版（用户拍板）：与建筑/贸易方块同构 ——
//   ① 紧凑小方块（图标 + 名称 + 人数），详细内容收进 hover / 点击展开的悬浮详情卡；
//   ② 增减方式支持**直接输入数字**（回车或失焦生效，store.setJobCount 自带人数钳制）；
//   ③ 保留顶部人力分配横条（去掉图例列表，横条自带悬浮提示），整体密度对齐建筑页。
//
// 渐进解锁：未达条件的岗位灰化显示（🔒 + 缺什么）；
// 退役职业（采集者/打石者转职中）不可分配，显示转出状态。
//
// 纯文字模式：所有 emoji 走 <Icon>；图标可能渲染为 null，
// 因此所有含图标的行都用 flex + gap 排布，不依赖图标宽度。

import { useState } from 'react';
import { useStore, toEngineState, type GameState } from '../../state/store';
import {
  calcJobOutput,
  getAssignedPopulation,
  getIdlePopulation,
  isJobUnlocked,
  type E1State,
} from '../../game/engine';
import { getRevealedJobs, isJobRetired } from '../../game/reveal';
import { JOB_MAP } from '../../data/jobs';
import { ERAS, eraDistance } from '../../data/era';
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

/** 增减按钮统一尺寸：与数字输入框同高，一行排得下 */
const BTN =
  'inline-flex h-8 items-center justify-center rounded-md px-2 font-mono text-xs tabular-nums text-gray-300 transition-colors hover:bg-gray-700 hover:text-gray-100 disabled:cursor-not-allowed disabled:text-gray-600 disabled:hover:bg-transparent';

const SECTION_TITLE = 'text-xs uppercase tracking-wide text-gray-500';

export function JobPanel() {
  const state = useStore();
  const view = toEngineState(state);
  const { clearJobs } = state;

  const jobs = getRevealedJobs(view);
  const idle = Math.floor(getIdlePopulation(view));
  const assigned = getAssignedPopulation(view);
  const total = state.population;

  return (
    <section className="space-y-4 pb-40">
      {/* 页头：标题 + 空闲/总人口摘要 + 清空按钮 */}
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={`flex items-center gap-1.5 ${SECTION_TITLE}`}>
          <Icon emoji="👥" className="text-xs" />
          <span>岗位分配</span>
        </h2>
        <div className="flex items-baseline gap-3">
          <span className="text-xs tabular-nums text-gray-500">
            空闲{' '}
            <span className={`font-semibold ${idle > 0 ? 'text-accent' : 'text-gray-600'}`}>
              {idle}
            </span>{' '}
            / 总人口 {formatNumber(total, 0)} · 在岗 {formatNumber(assigned, 0)}
          </span>
          <button
            type="button"
            onClick={clearJobs}
            disabled={assigned <= 0}
            className={`text-xs transition-colors ${
              assigned <= 0
                ? 'cursor-not-allowed text-gray-700'
                : 'text-gray-500 hover:text-gray-100'
            }`}
          >
            清空分配
          </button>
        </div>
      </header>

      {/* ── 人力分配一览（细横条，悬浮看明细；不再单列图例）── */}
      <div className="flex h-2 w-full overflow-hidden rounded-md bg-gray-800/60">
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

      {/* ── 岗位网格：紧凑方块，hover / 点击出详情卡 ── */}
      {jobs.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-600">
          暂无可用岗位 —— 继续研究科技以解锁新的生产方式。
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {jobs.map(job => (
            <JobTile key={job.id} job={job} state={state} view={view} idle={idle} />
          ))}
        </div>
      )}

      <p className="text-xs leading-relaxed text-gray-600">
        {/* 文案按时代分流：E3 起知识由书吏产出，"人口=经验来源"的表述不再成立；
            「谷物」已并入「食物」（资源合并，非删除），文案统一用「食物」。 */}
        {state.era === 'E3' ? (
          <>人口是劳动力与市场的根基；知识由<strong>书吏</strong>产出，不再随人口自然增长。每人每秒消耗 0.2 食物。</>
        ) : state.era === 'E1' ? (
          <>人口既是劳动力也是经验来源：人越多，经验积累越快；但每人每秒消耗 0.2 食物。分配时优先保证食物产出高于消耗。</>
        ) : (
          <>人口既是劳动力也是经验来源：人越多，经验积累越快；但每人每秒消耗 0.25 食物（牲畜另耗饲料）—— 定居时代的关键是<strong>秋季多下田</strong>，在入冬前把粮仓攒到冬耗之上。</>
        )}
      </p>
    </section>
  );
}

/**
 * 单个岗位方块（与建筑/贸易方块同构）。
 *
 * 常规态：图标 + 名称 + 人数（未解锁压暗 + 🔒，退役显示"转职中"）；
 * 详情态（hover / 点击固定）：说明、人均/合计速率、进阶三态提示、
 * 分配控件（-10/-1/数字输入/+1/+10/Max）。
 */
function JobTile({
  job,
  state,
  view,
  idle,
}: {
  job: JobDef;
  state: GameState;
  view: E1State;
  idle: number;
}) {
  const [pinned, setPinned] = useState(false);
  const count = state.jobs[job.id] ?? 0;
  const unlocked = isJobUnlocked(job.id, view);
  const retired = isJobRetired(job.id, view);
  const assignable = unlocked && !retired;

  // 可分配的方块亮起（空闲人口 > 0 时更明显），与建筑"可建亮起"同一语言
  const lit = assignable && idle > 0;

  return (
    <div
      className="relative"
      onMouseEnter={() => setPinned(true)}
      onMouseLeave={() => setPinned(false)}
    >
      {/* ── 紧凑方块 ── */}
      <button
        type="button"
        className={`flex w-full flex-col items-center gap-1 rounded-md border px-2 py-3 text-center transition-colors ${
          !unlocked
            ? 'cursor-default border-gray-800/60 bg-gray-900/20 opacity-40'
            : retired
              ? 'cursor-default border-amber-800/40 bg-amber-500/5'
              : lit
                ? 'cursor-pointer border-accent/50 bg-accent/10'
                : 'cursor-pointer border-gray-700 bg-gray-900/40 hover:border-gray-600 hover:bg-gray-800/60'
        }`}
      >
        <Icon emoji={job.icon} className="text-xl leading-none" />
        <span
          className={`w-full truncate text-xs font-medium ${unlocked ? 'text-gray-100' : 'text-gray-500'}`}
        >
          {job.name}
        </span>
        <span className="font-mono text-xs tabular-nums text-gray-300">
          {retired ? '转职中' : unlocked ? `${count} 人` : '🔒 未解锁'}
        </span>
      </button>

      {/* ── 悬浮详情卡 ── */}
      {pinned && (
        <div className="absolute left-1/2 top-full z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border border-gray-700 bg-gray-900 p-3 shadow-xl shadow-black/50">
          {/* 标题行 */}
          <div className="flex items-center gap-2">
            <Icon emoji={job.icon} className="text-lg leading-none" />
            <span className="text-sm font-semibold text-gray-100">{job.name}</span>
            <span className="ml-auto rounded-md bg-gray-800/60 px-1.5 py-0.5 text-xs tabular-nums text-gray-400">
              {count} 人
            </span>
          </div>

          {/* 说明 */}
          <p className="mt-2 text-xs leading-relaxed text-gray-400">{job.desc}</p>

          {/* 速率 / 状态区 */}
          {unlocked ? (
            <div className="mt-2 space-y-0.5 border-t border-gray-800 pt-2 text-xs tabular-nums text-gray-400">
              {(() => {
                const outDef = RESOURCE_MAP[job.output];
                const per = perPersonRate(job, view, count);
                const totalOut = calcJobOutput(job.id, view);
                return (
                  <>
                    <div className="flex items-center gap-1">
                      <Icon emoji={outDef.icon} className="text-xs" />
                      <span>每人 {formatRate(per)}/秒</span>
                    </div>
                    <div className="text-gray-500">
                      {count > 0
                        ? `${count} 人合计 ${formatRate(totalOut)} ${outDef.name}/秒`
                        : '尚未派人'}
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-1.5 border-t border-gray-800 pt-2 text-xs text-gray-500">
              <Icon emoji="🔒" className="text-xs" />
              <span>{unlockHint(job)}</span>
            </div>
          )}

          {/* 进阶三态提示：机制不能悄悄存在（详见旧版注释） */}
          {unlocked && job.upgradesTo && !retired && (
            <JobUpgradeHint job={job} view={view} working={count > 0} />
          )}
          {retired && (
            <div className="mt-2 border-t border-gray-800 pt-2 text-xs text-warn">
              本职业已随时代取消，剩余 {count} 人正在转为
              {job.upgradesTo ? JOB_MAP[job.upgradesTo.job].name : '新职业'}
            </div>
          )}

          {/* 分配控件：-10/-1/数字输入/+1/+10/Max（仅可分配岗位） */}
          {assignable && <JobControls jobId={job.id} count={count} idle={idle} />}
        </div>
      )}
    </div>
  );
}

/** 岗位进阶三态提示（时代触发 / 科技触发两种门槛） */
function JobUpgradeHint({ job, view, working }: { job: JobDef; view: E1State; working: boolean }) {
  const up = job.upgradesTo!;
  const target = JOB_MAP[up.job];
  const techGate = up.trigger === 'tech' ? target.requires.tech : undefined;
  const gateOpen = techGate ? !!view.techs[techGate] : eraDistance(target.era, view.era) >= 0;
  const label = gateOpen ? '已取消' : techGate ? '职业进阶' : '时代演进';

  return (
    <div className={`mt-2 border-t border-gray-800 pt-2 text-xs ${working && gateOpen ? 'text-warn' : 'text-gray-600'}`}>
      {label} → {target.name}：
      {!gateOpen
        ? techGate
          ? `研究「${TECH_MAP[techGate]?.name ?? techGate}」后本职业取消，全员转为${target.name}`
          : `进入${ERAS[target.era].name}后本职业取消，全员转为${target.name}`
        : working
          ? `全员转为${target.name}中（每 0.25 秒 1 人）`
          : `已全部转为${target.name}`}
    </div>
  );
}

/**
 * 分配控件：-10 / -1 / [数字输入] / +1 / +10 / Max。
 * 输入框可直接敲数字，回车或失焦提交 —— store.setJobCount 会钳制到
 * [0, 总人口 − 其他岗位在岗数]，越界输入自动落到合法值，无需 UI 再算上限。
 */
function JobControls({
  jobId,
  count,
  idle,
}: {
  jobId: JobDef['id'];
  count: number;
  idle: number;
}) {
  const setJobCount = useStore(s => s.setJobCount);
  const assignAllIdle = useStore(s => s.assignAllIdle);

  // draft = 正在编辑的输入内容；null 表示未在编辑（显示真实人数）
  const [draft, setDraft] = useState<string | null>(null);
  const inputVal = draft ?? String(count);

  const commit = () => {
    if (draft === null) return;
    const n = Math.floor(Number(draft));
    if (Number.isFinite(n)) setJobCount(jobId, n);
    setDraft(null);
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-gray-800 pt-2">
      <button type="button" className={BTN} disabled={count <= 0} onClick={() => setJobCount(jobId, count - 10)}>
        -10
      </button>
      <button type="button" className={BTN} disabled={count <= 0} onClick={() => setJobCount(jobId, count - 1)}>
        -1
      </button>
      <input
        value={inputVal}
        onChange={e => setDraft(e.target.value.replace(/[^\d]/g, ''))}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
        inputMode="numeric"
        aria-label={`${jobId} 人数输入`}
        className="h-8 w-14 rounded-md border border-gray-700 bg-gray-800 text-center font-mono text-xs tabular-nums text-gray-100 outline-none focus:border-gray-500"
      />
      <button type="button" className={BTN} disabled={idle <= 0} onClick={() => setJobCount(jobId, count + 1)}>
        +1
      </button>
      <button type="button" className={BTN} disabled={idle <= 0} onClick={() => setJobCount(jobId, count + 10)}>
        +10
      </button>
      {/* Max 是主操作：空闲人口 > 0 时用语义色 ok 提示"可分配" */}
      <button
        type="button"
        className={`h-8 rounded-md px-2 text-xs font-medium transition-colors ${
          idle > 0 ? 'text-ok hover:bg-ok/10' : 'cursor-not-allowed text-gray-600'
        }`}
        disabled={idle <= 0}
        onClick={() => assignAllIdle(jobId)}
      >
        Max
      </button>
    </div>
  );
}

// App.tsx 目前以具名导入引用本组件，这里保留默认导出以兼容两种写法
export default JobPanel;
