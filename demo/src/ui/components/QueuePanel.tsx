// 研究队列面板 —— 挂机游戏的生命线
// 没有队列，玩家必须守在电脑前；有了队列，离线/挂机也能自动推进研究。
// 数值与规则见 design/game/02-tech-eras.md
//
// 布局约定（布局重构后）：
// 本组件位于「文明」页中部，上面还有科技树要看，因此刻意做得紧凑 ——
// 只有「一行表头 + 一行 5 个横向槽位 + 一行脚注」，
// 不再自带 max-w/mx-auto 之类的外层容器（外层 App 已给 mx-auto max-w-4xl）。
//
// 视觉约定（v3 简约化）：
//   · 整块去边框，只留一层极淡背景 + 留白
//   · 空槽用虚线框表示（虚线的"空"感比实线强）；有内容的槽位用极淡背景，无边框
//   · 只有「队列为空」这个危险状态保留黄色，其余全部灰阶
//   · 槽位里的科技图标经 <Icon> 渲染（纯文字模式），行内间距由 gap 提供

import { useState } from 'react';
import type { DragEvent } from 'react';
import { useStore, toEngineState } from '../../state/store';
import { TECH_MAP } from '../../data/techs';
import { QUEUE } from '../../data/constants';
import { canResearch, calcExperienceOutput } from '../../game/engine';
import { formatNumber, formatRate, formatTime } from '../../core/format';
import { Icon } from './Icon';

/** 队列中一行所需的展示数据（预计完成时间在渲染前一次性算好） */
interface QueueRow {
  techId: string;
  index: number;
  icon: string;
  name: string;
  /** 该科技自身的成本 */
  cost: number;
  /** 从队列开头算起的总投入（含前面所有项） */
  cumulativeCost: number;
  /** 预计还需多少秒才能研究完（可能为 Infinity，表示当前没有经验产出） */
  eta: number;
  /** 前置分支未满足时的原因说明；正常时为 null */
  reason: string | null;
}

export function QueuePanel() {
  const s = useStore();
  const view = toEngineState(s);

  // 拖动中的源槽位 / 当前悬停的目标槽位（用原生 drag events 实现排序）
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const queue = s.queue;

  // 经验产出速率（每秒）：预计完成时间的分母
  const expRate = calcExperienceOutput(view);

  // 逐项累加成本：队列第 n 项必须等前面全部研究完才能开始，
  // 所以它的预计时间要按「累计成本 − 当前经验」来算。
  let cumulativeCost = 0;
  const rows: QueueRow[] = queue.map((techId, index) => {
    const def = TECH_MAP[techId];
    cumulativeCost += def.cost;
    const remaining = Math.max(0, cumulativeCost - view.experience);
    // 速率为 0 时无法估算 → Infinity，formatTime 会显示为「—」
    const eta = expRate > 0 ? remaining / expRate : Number.POSITIVE_INFINITY;

    // 前置是否真的满足（不论经验够不够）：经验不足是排队时的正常状态，不算异常
    const requiresAny = def.requiresAny ?? [];
    const locked =
      def.requires.some(r => !view.techs[r]) ||
      (requiresAny.length > 0 && !requiresAny.some(r => view.techs[r]));
    const check = canResearch(techId, view);

    return {
      techId,
      index,
      icon: def.icon,
      name: def.name,
      cost: def.cost,
      cumulativeCost,
      eta,
      reason: locked ? (check.reason ?? '前置科技未满足') : null,
    };
  });

  // ── 原生 HTML5 拖动排序 ──
  const handleDragStart = (e: DragEvent<HTMLDivElement>, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // 同时写进 dataTransfer，方便跨元素/未来扩展读取
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, index: number) => {
    // 必须阻止默认行为，否则浏览器不会触发 drop
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overIndex !== index) setOverIndex(index);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    const payload = e.dataTransfer.getData('text/plain');
    const from = dragIndex ?? (payload === '' ? -1 : Number(payload));
    // 只接受合法的源下标，并且位置真的变了才重排
    if (from >= 0 && from < queue.length && from !== index) {
      s.reorderQueue(from, index);
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    // 单块紧凑面板：去边框，只用极淡背景（外层已有 mx-auto max-w-4xl）
    <div className="space-y-2 rounded-md bg-gray-800/40 px-3 py-2">
      {/* 表头：队列占用 / 经验产出速率；队列为空时把黄色警告压进同一行 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <h3 className="text-xs font-medium tracking-wide text-gray-300">
          研究队列{' '}
          <span className="text-gray-500 tabular-nums">
            {queue.length} / {QUEUE.MAX_LENGTH}
          </span>
        </h3>
        <span className="text-gray-500 tabular-nums">经验 {formatRate(expRate)}/s</span>

        {/* 队列为空：挂机不会推进研究 —— 唯一保留的醒目色（压缩成一行，不额外占高度） */}
        {queue.length === 0 && (
          <span className="ml-auto inline-flex items-center gap-1 rounded bg-yellow-500/10 px-2 py-0.5 text-yellow-300/90">
            <Icon emoji="⚠️" className="text-[11px]" />
            <span className="font-medium">队列为空 —— 挂机不会推进研究</span>
          </span>
        )}

        {queue.length > 0 && (
          <span className="ml-auto text-[10px] text-gray-600">
            拖动调整顺序 · 预计时间按累计成本 ÷ 经验产出估算
          </span>
        )}
      </div>

      {/* 5 个槽位横向排列：纵向只占一行，给下面的科技树留空间 */}
      <div className="flex gap-1.5">
        {Array.from({ length: QUEUE.MAX_LENGTH }, (_, slot) => {
          const row = rows[slot];

          // 空槽：虚线框占位（虚线自带"空"的语义）
          if (!row) {
            return (
              <div
                key={`empty-${slot}`}
                className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md border border-dashed border-gray-700/60 px-1.5 py-1.5 text-[11px] text-gray-600"
              >
                <span className="text-gray-700 tabular-nums">{slot + 1}</span>
                <span className="hidden xl:inline">空槽位</span>
              </div>
            );
          }

          const isDragging = dragIndex === row.index;
          const isOver = overIndex === row.index;

          return (
            <div
              // techId 可能重复，键里带上下标避免冲突
              key={`${row.techId}-${row.index}`}
              draggable
              onDragStart={e => handleDragStart(e, row.index)}
              onDragOver={e => handleDragOver(e, row.index)}
              onDrop={e => handleDrop(e, row.index)}
              onDragEnd={handleDragEnd}
              title={`${row.name}｜拖动可调整研究顺序`}
              className={`flex min-w-0 flex-1 select-none flex-col gap-0.5 rounded-md px-1.5 py-1 text-[11px] transition-colors ${
                isDragging
                  ? 'cursor-grabbing bg-gray-800/40 opacity-40'
                  : isOver
                    ? 'cursor-grab bg-gray-800/70 ring-1 ring-gray-600'
                    : 'cursor-grab bg-gray-900/50 hover:bg-gray-800/60'
              }`}
            >
              {/* 第 1 行：拖柄 + 图标 + 名称 + 删除 */}
              <div className="flex min-w-0 items-center gap-1">
                {/* ⋮⋮ 是界面符号（非 emoji），保留 */}
                <span className="shrink-0 leading-none text-gray-700">⋮⋮</span>
                {/* 科技图标（纯文字模式下为 null，靠 gap 保持间距） */}
                <Icon emoji={row.icon} className="shrink-0 leading-none" />
                <span className="min-w-0 flex-1 truncate text-gray-200">{row.name}</span>
                {/* ✕ 是界面符号（非 emoji）：危险动作用红色 hover 提示即可 */}
                <button
                  type="button"
                  draggable={false}
                  onClick={() => s.dequeue(row.index)}
                  title="移出队列"
                  // 队列槽仅 ~60px 宽，删除键若给满 40px 宽会挤掉科技名；
                  // 故保持紧凑宽度（natural ~24px），仅把高度放到 40px（h-10）保证竖向触屏目标。
                  className="inline-flex h-10 items-center justify-center shrink-0 rounded-md px-2 leading-none text-gray-600 transition-colors hover:bg-gray-700 hover:text-red-300"
                >
                  ✕
                </button>
              </div>

              {/* 第 2 行：成本 + 预计完成时间 */}
              <div className="flex min-w-0 items-center justify-between gap-1">
                <span className="shrink-0 text-gray-500 tabular-nums">
                  {formatNumber(row.cost)} 经验
                </span>
                <span className="shrink-0 text-gray-400 tabular-nums">≈ {formatTime(row.eta)}</span>
              </div>

              {/* 前置未满足时的原因（危险状态才用红） */}
              {row.reason !== null && (
                <div className="truncate text-red-400/80" title={row.reason}>
                  {row.reason}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 脚注：离线规则说明，保持单行 */}
      <p className="text-[10px] text-gray-600">
        离线研究效率 {Math.round(QUEUE.OFFLINE_EFFICIENCY * 100)}%，上限{' '}
        {formatTime(QUEUE.OFFLINE_CAP_SEC)}。
      </p>
    </div>
  );
}
