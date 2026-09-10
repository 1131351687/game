// 研究队列面板 —— 挂机游戏的生命线
// 没有队列，玩家必须守在电脑前；有了队列，离线/挂机也能自动推进研究。
// 数值与规则见 design/game/02-tech-eras.md

import { useState } from 'react';
import type { DragEvent } from 'react';
import { useStore, toEngineState } from '../../state/store';
import { TECH_MAP } from '../../data/techs';
import { QUEUE } from '../../data/constants';
import { canResearch, calcExperienceOutput } from '../../game/engine';
import { formatNumber, formatRate, formatTime } from '../../core/format';

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
    <div className="bg-gray-800 rounded p-3 space-y-2">
      {/* 顶部：队列占用 + 经验产出速率 */}
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-gray-100">
          研究队列{' '}
          <span className="font-normal text-gray-400">
            {queue.length} / {QUEUE.MAX_LENGTH}
          </span>
        </h3>
        <span className="text-xs text-gray-400">经验 {formatRate(expRate)}/s</span>
      </div>

      {/* 队列为空：挂机不会推进研究 —— 黄色警告 */}
      {queue.length === 0 && (
        <div className="flex items-center gap-2 rounded border border-yellow-600/60 bg-yellow-900/40 px-2 py-1.5 text-xs text-yellow-200">
          <span className="leading-none">⚠️</span>
          <span className="font-medium">队列为空 —— 挂机不会推进研究</span>
        </div>
      )}

      <div className="space-y-1">
        {/* 固定渲染 MAX_LENGTH 个槽位，空槽用虚框占位 */}
        {Array.from({ length: QUEUE.MAX_LENGTH }, (_, slot) => {
          const row = rows[slot];

          if (!row) {
            return (
              <div
                key={`empty-${slot}`}
                className="flex items-center gap-2 rounded border border-dashed border-gray-700 px-2 py-1.5 text-xs text-gray-600"
              >
                <span className="w-5 text-center text-gray-700">{slot + 1}</span>
                <span>空槽位</span>
              </div>
            );
          }

          const isDragging = dragIndex === row.index;
          const isOver = overIndex === row.index;

          return (
            <div
              key={row.techId}
              draggable
              onDragStart={e => handleDragStart(e, row.index)}
              onDragOver={e => handleDragOver(e, row.index)}
              onDrop={e => handleDrop(e, row.index)}
              onDragEnd={handleDragEnd}
              title="拖动可调整研究顺序"
              className={`flex select-none items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors ${
                isDragging
                  ? 'cursor-grabbing bg-gray-700 opacity-40'
                  : isOver
                    ? 'cursor-grab bg-gray-700 ring-1 ring-blue-500'
                    : 'cursor-grab bg-gray-900 hover:bg-gray-700/70'
              }`}
            >
              <span className="w-4 shrink-0 text-center leading-none text-gray-600">⋮⋮</span>
              <span className="shrink-0 text-base leading-none">{row.icon}</span>

              <div className="min-w-0 flex-1">
                <div className="truncate text-gray-200">{row.name}</div>
                {row.reason !== null && (
                  <div className="truncate text-red-400">{row.reason}</div>
                )}
              </div>

              <span className="shrink-0 text-gray-400">
                {formatNumber(row.cost)} 经验
              </span>
              <span className="w-20 shrink-0 text-right text-blue-400">
                ≈ {formatTime(row.eta)}
              </span>

              <button
                type="button"
                onClick={() => s.dequeue(row.index)}
                title="移出队列"
                className="shrink-0 rounded px-1 leading-none text-gray-500 hover:bg-gray-600 hover:text-red-300"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-500">
        预计时间按「累计成本 ÷ 经验产出」估算；离线研究效率{' '}
        {Math.round(QUEUE.OFFLINE_EFFICIENCY * 100)}%，上限{' '}
        {formatTime(QUEUE.OFFLINE_CAP_SEC)}。
      </p>
    </div>
  );
}
