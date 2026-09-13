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

/** 列表内 +/- 按钮：放宽到 40px 高（h-10）适配触屏；保留 text-sm + 紧凑 px-2，
 *  避免一行 5 个按钮在窄屏换行爆版（实测 375px 屏也能单行容纳）。 */
const BTN =
  'inline-flex h-10 items-center justify-center rounded-md px-2 text-sm font-mono tabular-nums text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-gray-100 disabled:cursor-not-allowed disabled:text-gray-600 disabled:hover:bg-transparent';

/** 小号区块标题：小号化 + 灰淡化（标签属次要层级，统一收为 gray-400） */
const SECTION_TITLE = 'text-xs uppercase tracking-wide text-gray-400';

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
    // space-y-6：区块之间用留白分层（去卡片化后，留白是唯一的分层手段）
    <section className="space-y-6 pb-40">
      {/* 页头：标题（主文字）+ 清空按钮（可点文字，hover 才显色） */}
      <header className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-100">
          <Icon emoji="👥" className="text-sm" />
          <span>岗位分配</span>
        </h2>
        <button
          type="button"
          onClick={clearJobs}
          disabled={assigned <= 0}
          className={`inline-flex h-10 items-center justify-center rounded-md px-3 text-sm transition-colors ${
            assigned <= 0
              ? 'cursor-not-allowed text-gray-600'
              : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-100'
          }`}
        >
          清空分配
        </button>
      </header>

      {/* 顶部：空闲人口 / 总人口 —— 无卡片，靠留白与字重分层（空闲>0 用强调色点出"尚待分配"） */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xs text-gray-400">空闲人口</span>
        <span
          className={`text-lg font-semibold tabular-nums ${
            idle > 0 ? 'text-accent' : 'text-gray-600'
          }`}
        >
          {idle}
        </span>
        <span className="text-gray-600">/</span>
        <span className="text-xs text-gray-400">总人口</span>
        <span className="text-lg font-semibold tabular-nums text-gray-100">
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
        {/* 横条轨道：保留极淡实色底（bg-gray-800）作为"槽"的语义，非内容卡片 */}
        <div className="flex h-2.5 w-full overflow-hidden rounded-md bg-gray-800">
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
          <div className="px-4 py-8 text-center text-sm text-gray-600">
            暂无可用岗位 —— 继续研究科技以解锁新的生产方式。
          </div>
        ) : (
          jobs.map(job => {
            const count = state.jobs[job.id] ?? 0;
            const unlocked = isJobUnlocked(job.id, view);
            const output = calcJobOutput(job.id, view);
            const per = perPersonRate(job, view, count);
            const outDef = RESOURCE_MAP[job.output];
            // 已随时代退役的职业（采集者在农耕时代）：不再可分配，只显示正在转出
            const retired = isJobRetired(job.id, view);

            // 岗位行：去掉卡片壳与底色，反白只在 hover 出现；未解锁行靠 opacity 弱化
            return (
              <div
                key={job.id}
                className={`space-y-2 px-4 py-3 transition-colors ${
                  unlocked ? 'hover:bg-gray-800/50' : ''
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
                        <span className="tabular-nums text-gray-400">{count} 人</span>
                        {unlocked && (
                          <>
                            <span className="text-gray-600">→</span>
                            <span className="tabular-nums text-gray-400">
                              {formatRate(output)} {outDef.name}/秒
                            </span>
                          </>
                        )}
                      </div>
                      {/* 说明文字属次要层级（gray-400） */}
                      <div className="mt-0.5 truncate text-xs text-gray-400">{job.desc}</div>
                      {/* 岗位进阶提示：**三态**呈现，让玩家在任何时候都能看懂
                          "这个岗位会变成什么"以及"现在还差什么"。

                          为什么必须三态（而不是"解锁后才显示"）：
                          最初只在目标岗位解锁后显示，结果是——「农业」还没研究的玩家
                          在界面上完全看不到这个机制存在，以为它没做。
                          机制可以悄悄生效，但**不能悄悄存在**。

                          进阶不是"多一个岗位"，而是**这个职业被新时代取代**：
                            时代未到 → 预告"进入某时代后该职业取消"
                            时代已到 → 正在全员转出（每 0.25 秒 1 人）
                          仅展示状态、不提供按钮：转换是自动的，这里只是让玩家看得见。 */}
                      {job.upgradesTo &&
                        (() => {
                          const target = JOB_MAP[job.upgradesTo.job];
                          // 触发门槛：era 触发看时代；tech 触发（打石者→矿工）看前置科技。
                          const techGate =
                            job.upgradesTo.trigger === 'tech' ? target.requires.tech : undefined;
                          const gateOpen = techGate
                            ? !!view.techs[techGate]
                            : eraDistance(target.era, view.era) >= 0;
                          const working = gateOpen && (view.jobs[job.id] ?? 0) > 0;
                          const label = gateOpen
                            ? '已取消'
                            : techGate
                              ? '职业进阶'
                              : '时代演进';

                          return (
                            <div
                              className={`mt-0.5 text-xs ${working ? 'text-warn' : 'text-gray-600'}`}
                            >
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
                        })()}
                    </div>
                  </div>

                  {/* 右：速率明细 */}
                  <div className="shrink-0 text-right">
                    {unlocked ? (
                      <>
                        <div className="flex items-center justify-end gap-1 text-xs tabular-nums text-gray-400">
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

                {retired ? (
                  // 退役职业：不提供任何分配入口 —— 它正在被新时代消化掉
                  <div className="text-xs text-warn">
                    本职业已随时代取消，剩余 {count} 人正在转为
                    {job.upgradesTo ? JOB_MAP[job.upgradesTo.job].name : '新职业'}
                  </div>
                ) : unlocked ? (
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
                    {/* Max 是主操作：空闲人口 > 0 时为"可行动"，用语义色 ok（可分配）提示 */}
                    <button
                      type="button"
                      className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                        idle > 0
                          ? 'text-ok hover:bg-ok/10'
                          : 'cursor-not-allowed text-gray-600'
                      }`}
                      disabled={idle <= 0}
                      onClick={() => assignAllIdle(job.id)}
                    >
                      Max
                    </button>
                  </div>
                ) : (
                  // 前置科技已研究但工具世代未到（猎人）：灰化 + 提示缺什么
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
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

// App.tsx 目前以具名导入引用本组件，这里保留默认导出以兼容两种写法
export default JobPanel;
