// 记录面板（E3 城邦时代 · 刻录系统）
//
// 刻录 = 把"口头知识"刻上泥板，使其数值效果从 ×50% 提升到 ×100%。
// 占用记录槽位（硬上限），不可撤销；每刻录一项科技，档案库加成生效。
//
// 本组件对标 E1 的 FireDashboard（火种仪表盘）：可折叠外壳（默认收起），
// 展开后展示容量仪表盘、档案库加成、可刻录科技列表（含效果差量）。
//
// 所有 emoji 走 <Icon>，兼容纯文字模式（showIcons=false 时正常排布）。
// ⚠️ 引用 store.recordTech —— 该 action 若尚未在 store 中实现，
//    视为后续任务 wiring；此处先按"已存在"的契约写，不在此文件内补全。

import { useState } from 'react';
import { useStore, toEngineState } from '../../state/store';
import { aggregateEffects } from '../../game/engine';
import { getRecordCapacity, canRecord } from '../../game/record';
import { TECHS } from '../../data/techs';
import { E3 } from '../../data/constants';
import { formatNumber, formatPercent } from '../../core/format';
import { Icon } from './Icon';
import { buildRecordDelta } from './recordEffects';

/** 刻录按钮：无边框轻量文字按钮，仅 hover 时透出紫色（记录系统主色） */
const RECORD_BTN =
  'inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-mono font-semibold tabular-nums transition-colors';

/** 小号区块标题 */
const SECTION_TITLE = 'text-xs uppercase tracking-wide text-gray-500';

/**
 * 可刻录科技筛选：
 *   ① 已研究（techs[id] === true）
 *   ② 未刻录（!recorded.includes(id)）
 *
 * 不限时代：记录系统开启后（E3 研究「楔形文字」），**所有**未刻录科技
 * 的数值型效果都会被打对折（engine.aggregateEffects 的 isOral 口径），
 * 包括 E1/E2 的存量科技。玩家进入 E3 后需要回头刻录旧科技以恢复满效果。
 * 顺序沿用 TECHS 中的定义顺序（E1 → E2 → E3），无需额外排序。
 */
function recordableTechs(
  techs: Record<string, boolean>,
  recorded: string[]
) {
  return TECHS.filter(
    t => techs[t.id] === true && !recorded.includes(t.id)
  );
}

export function RecordPanel({ className }: { className?: string }) {
  const state = useStore();
  const view = toEngineState(state);
  // 记录系统是否开启 —— 由「楔形文字」核心科技 enableRecording 控制。
  // 未开启时整面板不渲染（与 FireDashboard 在 fireEnabled=false 时返回 null 同理）。
  const eff = aggregateEffects(view);
  if (!eff.recordingEnabled) return null;

  // 默认收起：刻录是"历史档案"，不该抢占主内容注意力（与 TechTreeView 同思路）。
  const [open, setOpen] = useState(false);

  // 容量仪表盘
  const { cap, used, free } = getRecordCapacity(view);
  const scribes = state.jobs.scribe ?? 0;
  const ratio = cap > 0 ? Math.min(1, Math.max(0, used / cap)) : 0;
  // 档案库加成：archiveBonus 是每项的加成系数，总效果 = 1 + bonus × 已刻录数
  const recordedCount = state.recorded.length;
  const archiveTotal = 1 + eff.archiveBonus * recordedCount;

  const list = recordableTechs(state.techs, state.recorded);

  return (
    <section
      className={
        className
          ? `${className} space-y-3 rounded-md border border-gray-800 bg-gray-900/30 px-3 py-3`
          : 'space-y-3 rounded-md border border-gray-800 bg-gray-900/30 px-3 py-3'
      }
    >
      {/* ── 折叠头：标题 + 一句话 + 摘要 + 展开箭头 ── */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-1 text-left transition-colors hover:bg-gray-800/50 hover:text-gray-100"
      >
        <span className="text-[10px] text-gray-500">{open ? '▼' : '▶'}</span>
        <Icon emoji="📜" className="text-sm" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-200">刻录 · 泥板档案</div>
          {/* 一句话：让玩家一眼看懂"刻录在做什么" */}
          <div className="truncate text-xs text-gray-500">
            刻录把口头知识（×50%）刻成泥板（×100%）；解锁类效果本就全额生效。
          </div>
        </div>
        {/* 摘要：已刻录数 / 槽位数 */}
        <span className="shrink-0 font-mono text-xs tabular-nums text-gray-400">
          已刻录 {recordedCount} · 槽位 {used}/{cap}
        </span>
      </button>

      {open && (
        <div className="space-y-3">
          {/* ── 容量仪表盘（紧凑横向条，对标 FireDashboard）── */}
          <div className="flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto rounded-md bg-gray-900/40 px-4 py-2.5 text-sm leading-tight">
            <span className="flex shrink-0 items-center gap-1.5 text-gray-400">
              <Icon emoji="📜" className="text-sm" />
              <span>记录</span>
            </span>

            <div
              className="relative h-2 min-w-[6rem] flex-1 overflow-hidden rounded-md bg-gray-800"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={cap}
              aria-valuenow={used}
              aria-label={`记录 ${used} / ${formatNumber(cap, 0)}`}
            >
              <div
                className="h-full rounded-md transition-all duration-300"
                style={{
                  width: `${ratio * 100}%`,
                  // 满槽时变红警示，否则用记录系统的紫色（writing 分支主色 #a78bfa）
                  backgroundColor: free <= 0 ? '#ef4444' : '#a78bfa',
                }}
              />
            </div>

            <span className="shrink-0 min-w-[4rem] text-right font-mono font-semibold tabular-nums text-gray-200">
              {used}
              <span className="font-normal text-gray-600"> / {formatNumber(cap, 0)}</span>
            </span>

            <span
              className={`shrink-0 whitespace-nowrap text-xs tabular-nums ${
                free <= 0 ? 'text-danger' : 'text-gray-500'
              }`}
            >
              剩余 {free}
            </span>

            <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-gray-400">
              <Icon emoji="✍️" className="text-xs" />
              <span className="font-mono tabular-nums">书吏</span>
              <span
                className={`font-mono tabular-nums ${
                  scribes < 1 ? 'text-danger' : 'text-gray-200'
                }`}
              >
                {scribes}
              </span>
            </span>
          </div>

          {/* ── 档案库加成（面板顶部一行，实时取）── */}
          <div className="rounded-md bg-gray-900/40 px-3 py-1.5 text-xs text-gray-400">
            档案加成{' '}
            <span className="font-mono tabular-nums text-violet-300">
              ×{archiveTotal.toFixed(2)}
            </span>{' '}
            = 1 + {eff.archiveBonus.toFixed(2)} × {recordedCount}（每刻录一项科技生效）
          </div>

          {/* ── 可刻录科技列表 ── */}
          <div className="space-y-2">
            <h2 className={`flex items-center gap-1.5 ${SECTION_TITLE}`}>
              <Icon emoji="🔖" className="text-xs" />
              <span>可刻录科技</span>
            </h2>

            {list.length === 0 ? (
              <div className="rounded-md bg-gray-800/40 px-4 py-8 text-center text-sm text-gray-500">
                {used >= cap
                  ? '记录槽位已满 —— 建造学宫提升容量。'
                  : '没有可刻录的科技 —— 先研究 E3 科技再来刻录。'}
              </div>
            ) : (
              list.map(t => {
                const check = canRecord(t.id, view);
                const cost = Math.ceil(t.cost * 0.1);
                // 单独标红：知识不足
                const knowledgeShort = state.experience < cost;
                // 单独标红：无书吏
                const noScribe = scribes < 1;
                // 单独标红：槽位满
                const noSlot = free <= 0;

                // 效果差量（口头 ×0.5 → 刻录后 ×1.0），实时算
                const delta = buildRecordDelta(t, view);

                return (
                  <div
                    key={t.id}
                    className="flex flex-col gap-3 rounded-md px-4 py-3.5 transition-colors hover:bg-gray-800/50 lg:flex-row lg:items-center lg:justify-between lg:gap-6"
                  >
                    {/* 左：图标 + 名称 + 说明 + 效果差量 */}
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <Icon emoji={t.icon} className="text-2xl leading-none" />
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-gray-100">
                            {t.name}
                          </span>
                          <span className="rounded-md bg-gray-800/60 px-1.5 py-0.5 text-xs tabular-nums text-gray-400">
                            成本 {t.cost} → 刻录 {cost} 知识
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-gray-400">
                          {t.desc}
                        </p>
                        {/* 效果可感知：数值效果 ×0.5（口头）→ ×1.0（刻录后），逐条实时算 */}
                        <div className="rounded-md bg-orange-500/5 px-2 py-1.5 text-xs leading-relaxed text-gray-300">
                          <span className="font-medium text-orange-300">
                            数值效果：当前 ×0.5（口头）→ 刻录后 ×1.0
                          </span>
                          {delta.length > 0 && (
                            <ul className="mt-0.5 space-y-0.5 font-mono tabular-nums text-gray-400">
                              {delta.map((line, i) => (
                                <li key={i}>{line}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 右：刻录按钮 */}
                    <div className="flex shrink-0 flex-col items-stretch gap-1.5 lg:w-44 lg:items-end">
                      {/* 阻断原因（就近显示，命中一条即止） */}
                      {!check.ok && check.reason && (
                        <span
                          className={`text-right text-xs tabular-nums ${
                            knowledgeShort || noScribe || noSlot
                              ? 'text-danger/80'
                              : 'text-gray-500'
                          }`}
                        >
                          {check.reason}
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={!check.ok}
                        onClick={() => state.recordTech(t.id)}
                        title={
                          check.ok
                            ? `刻录「${t.name}」，消耗 ${cost} 知识，占用 1 槽位`
                            : check.reason ?? '无法刻录'
                        }
                        className={`${RECORD_BTN} ${
                          check.ok
                            ? 'bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 active:bg-violet-500/30'
                            : 'cursor-not-allowed text-gray-700'
                        }`}
                      >
                        刻录
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <p className="text-xs leading-relaxed text-gray-600">
            记录容量 = {E3.RECORD_BASE}（基础）+ 学宫×{E3.RECORD_PER_ACADEMY}
            + 泥板制作 +2；每刻录一项科技，档案库加成提升{' '}
            {formatPercent(eff.archiveBonus, 0)}。
          </p>
        </div>
      )}
    </section>
  );
}

// App.tsx 以具名导入引用本组件；保留默认导出以兼容两种写法
export default RecordPanel;
