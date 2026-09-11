// 消息日志：底部固定面板，可折叠
//
// 折叠时只占一行（显示最新一条消息），展开时显示过滤栏 + 最近 20 条。
// 默认折叠 —— 科技树很高，垂直空间要留给主内容。
//
// 视觉约定（v3 简约化）：
//   · 去掉外层的边框与实心块感，只用极淡分隔与留白
//   · 消息行默认无背景色，仅「重要消息」保留高亮底色
//   · 过滤器做成 segmented control，选中项用 bg-gray-700（不用亮蓝）
//   · ▲ ▼ 是界面符号（非 emoji），按约定保留原样

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { ResetButton } from './ResetButton';

type Filter = 'all' | 'tech' | 'event' | 'warn';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'tech', label: '科技' },
  { id: 'event', label: '事件' },
  { id: 'warn', label: '警告' },
];

/** 每条消息的类别标签与配色（刻意压低饱和度：只有类别标签用色，正文保持灰阶） */
const CATEGORY_STYLE: Record<Filter, { label: string; className: string }> = {
  all: { label: '消息', className: 'text-gray-600' },
  tech: { label: '科技', className: 'text-sky-400/70' },
  event: { label: '事件', className: 'text-emerald-400/70' },
  warn: { label: '警告', className: 'text-red-400/80' },
};

/** 展开时只保留最近这么多条 */
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
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(
    () =>
      (filter === 'all' ? messages : messages.filter(m => m.category === filter)).slice(
        -MAX_VISIBLE
      ),
    [messages, filter]
  );

  const latest = messages[messages.length - 1];

  // 有新消息或切换过滤时自动滚到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filtered.length, filter, expanded]);

  // ── 折叠态：只有一行，显示最新消息 ──
  if (!expanded) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-t border-gray-800 bg-gray-900/95 px-3 py-1 text-xs">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex h-10 items-center justify-center shrink-0 rounded-md px-3 text-sm text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
          title="展开消息日志"
        >
          ▲ 消息
        </button>
        {latest ? (
          <>
            <span className="shrink-0 font-mono text-gray-600">{formatClock(latest.timestamp)}</span>
            <span className={`shrink-0 ${CATEGORY_STYLE[latest.category].className}`}>
              {CATEGORY_STYLE[latest.category].label}
            </span>
            <span
              className={`min-w-0 flex-1 truncate ${
                latest.important ? 'text-yellow-300' : 'text-gray-300'
              }`}
            >
              {latest.text}
            </span>
          </>
        ) : (
          <span className="flex-1 text-gray-600">暂无消息</span>
        )}
        <ResetButton />
      </div>
    );
  }

  // ── 展开态：去掉外层视觉重量，只留一条淡淡的分隔线 ──
  return (
    <div className="flex max-h-40 shrink-0 flex-col border-t border-gray-800 bg-gray-900/95 px-2 py-1.5 text-xs">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="inline-flex h-10 items-center justify-center rounded-md px-3 text-sm text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
            title="收起消息日志"
          >
            ▼ 收起
          </button>
          {/* 过滤器组：segmented control 风格 */}
          <div className="ml-1 inline-flex items-center gap-0.5 rounded-md bg-gray-800/70 p-0.5">
            {FILTERS.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={`rounded px-2 py-0.5 text-xs transition-colors ${
                  filter === f.id
                    ? 'bg-gray-700 text-gray-100'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ResetButton />
          <button
            type="button"
            onClick={clearMessages}
            className="rounded px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-800 hover:text-gray-300"
          >
            清空
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-2 py-0.5 text-gray-600">暂无消息</p>
        ) : (
          filtered.map(msg => {
            const style = CATEGORY_STYLE[msg.category];
            return (
              // 普通消息不加背景色，靠行距与灰阶分层；只有重要消息保留高亮
              <div
                key={msg.id}
                className={`flex items-baseline gap-2 rounded px-2 py-0.5 ${
                  msg.important ? 'bg-yellow-500/10 text-yellow-300' : 'text-gray-400'
                }`}
              >
                <span className="shrink-0 font-mono text-gray-600">
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
