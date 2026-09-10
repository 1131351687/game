// 消息日志：底部固定面板，按类别过滤，最新消息在最下面并自动滚到底部。

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../state/store';

type Filter = 'all' | 'tech' | 'event' | 'warn';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'tech', label: '科技' },
  { id: 'event', label: '事件' },
  { id: 'warn', label: '警告' },
];

/** 每条消息的类别标签与配色 */
const CATEGORY_STYLE: Record<Filter, { label: string; className: string }> = {
  all: { label: '消息', className: 'text-gray-500' },
  tech: { label: '科技', className: 'text-blue-400' },
  event: { label: '事件', className: 'text-green-400' },
  warn: { label: '警告', className: 'text-red-400' },
};

/** 只保留最近这么多条 */
const MAX_VISIBLE = 20;

/** 时间戳 → HH:MM:SS */
function formatClock(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function MessageLog() {
  const { messages, clearMessages } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 过滤 + 只取最近 20 条；保持时间顺序（最新在最下面），所以不 reverse
  const filtered = useMemo(
    () =>
      (filter === 'all' ? messages : messages.filter(m => m.category === filter)).slice(
        -MAX_VISIBLE
      ),
    [messages, filter]
  );

  // 有新消息或切换过滤时自动滚到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filtered.length, filter]);

  return (
    <div className="fixed bottom-0 left-0 right-0 max-h-40 overflow-y-auto border-t border-gray-700 bg-gray-900/95 p-2 text-xs">
      {/* 过滤按钮 + 清空 */}
      <div className="sticky top-0 z-10 mb-1 flex items-center justify-between bg-gray-900/95 pb-1">
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded px-2 py-1 text-xs ${
                filter === f.id
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={clearMessages}
          className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-800 hover:text-gray-300"
        >
          清空
        </button>
      </div>

      <div ref={scrollRef} className="space-y-0.5">
        {filtered.length === 0 ? (
          <p className="px-2 py-0.5 text-gray-600">暂无消息</p>
        ) : (
          filtered.map(msg => {
            const style = CATEGORY_STYLE[msg.category];
            return (
              <div
                key={msg.id}
                className={`flex items-baseline gap-2 rounded px-2 py-0.5 ${
                  // 重要消息高亮
                  msg.important ? 'bg-yellow-900/50 text-yellow-300' : 'text-gray-300'
                }`}
              >
                <span className="shrink-0 font-mono text-gray-500">
                  {formatClock(msg.timestamp)}
                </span>
                <span className={`w-8 shrink-0 ${style.className}`}>{style.label}</span>
                <span className="min-w-0 flex-1">{msg.text}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
