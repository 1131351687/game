// 时代跃迁面板（E1 远古时代 → E2 定居时代）
// 条件列表直接来自引擎 checkAdvance，界面只负责呈现，不重复写规则。

import { useState } from 'react';
import { useStore, toEngineState } from '../../state/store';
import { checkAdvance } from '../../game/engine';

export function AdvancePanel() {
  const s = useStore();
  const view = toEngineState(s);

  // 本 demo 中 E1 到此为止：点击跃迁后只弹一条说明
  const [notified, setNotified] = useState(false);

  const check = checkAdvance(view);
  const remaining = check.items.filter(i => !i.done).length;

  return (
    // 单块卡片：不再自带 max-w/mx-auto 外层容器（外层 App 已给 mx-auto max-w-4xl）。
    // 本面板位于「文明」页最上方，不在底部，因此不需要 pb-40 让开 MessageLog。
    // 条件全部达成时整块加一层翠绿描边，让玩家一眼看到可以跃迁了。
    <div
      className={`space-y-3 rounded-lg border bg-gray-800 p-3 transition-colors ${
        check.ok ? 'border-emerald-500/70 shadow-[0_0_18px_-6px_rgba(16,185,129,0.9)]' : 'border-gray-700'
      }`}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-gray-100">时代跃迁 · 定居时代</h3>
        <span className={`text-xs ${check.ok ? 'text-green-400' : 'text-gray-400'}`}>
          {check.ok ? '条件已满足' : `还差 ${remaining} 项`}
        </span>
      </div>

      {/* 4 项跃迁条件：达成 ✓ 绿色，未达成 ○ 灰色 */}
      <ul className="space-y-1">
        {check.items.map(item => (
          <li
            key={item.label}
            className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${
              item.done ? 'bg-gray-900 text-green-400' : 'bg-gray-900 text-gray-500'
            }`}
          >
            <span className="w-4 shrink-0 text-center leading-none">
              {item.done ? '✓' : '○'}
            </span>
            <span className="flex-1 truncate">{item.label}</span>
            <span className={`shrink-0 ${item.done ? 'text-green-500/80' : 'text-gray-500'}`}>
              {item.detail}
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={!check.ok}
        onClick={() => setNotified(true)}
        className={`w-full rounded py-2.5 font-semibold transition-all ${
          check.ok
            ? // 全部条件达成：加大加粗 + 亮翠绿 + 外发光 + 描边，做成页面最醒目的按钮
              'bg-emerald-500 text-base text-white ring-2 ring-emerald-300/70 shadow-[0_0_24px_-2px_rgba(16,185,129,0.95)] hover:bg-emerald-400 hover:ring-emerald-200'
            : 'cursor-not-allowed bg-gray-700 text-sm text-gray-500'
        }`}
      >
        {check.ok ? '🌾 迈向定居时代' : `迈向定居时代（还差 ${remaining} 项）`}
      </button>

      {/* 跃迁提示：本 demo 到此结束 */}
      {notified && (
        <div className="flex items-start gap-2 rounded border border-emerald-600/60 bg-emerald-900/40 px-2 py-1.5 text-xs text-emerald-200">
          <span className="leading-none">🎉</span>
          <div className="flex-1">
            <p className="font-medium">E1 · 远古时代 到此结束</p>
            <p className="mt-0.5 text-emerald-300/80">
              你已经跨过门槛：火种、工具与群体协作把人类带到了定居的门前。
              定居时代（E2）尚未在本 demo 中实现。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNotified(false)}
            title="关闭提示"
            className="shrink-0 rounded px-1 leading-none text-emerald-400/70 hover:bg-emerald-800 hover:text-emerald-100"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
