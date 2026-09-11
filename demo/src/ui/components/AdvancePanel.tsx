// 时代跃迁面板（当前时代 → 下一个时代）
// 条件列表直接来自引擎 checkAdvance，界面只负责呈现，不重复写规则。
//
// ⚠️ 面板文案必须**按时代动态取**，不能写死。
//    此前标题与按钮硬编码成「定居时代」，导致玩家在 E2 里看到的是
//    「迈向定居时代」—— 定居（E2）是**当前**时代，按钮指的却是它自己。

import { useStore, toEngineState } from '../../state/store';
import { checkAdvance } from '../../game/engine';
import { ERAS, type EraId } from '../../data/era';
import { Icon } from './Icon';

/** 尚未实装的下一代表名（目前只有 E1 / E2 落地） */
const UNIMPLEMENTED_NEXT: Partial<Record<EraId, string>> = {
  E2: '城邦时代', // E3，设计文档已撰写但未实装
};

export function AdvancePanel() {
  const s = useStore();
  const view = toEngineState(s);

  const check = checkAdvance(view);
  const remaining = check.items.filter(i => !i.done).length;

  // 下一个时代：按 index 顺序找。找不到说明尚未实装。
  const current = ERAS[s.era];
  const nextId = (Object.keys(ERAS) as EraId[]).find(id => ERAS[id].index === current.index + 1);
  const nextMeta = nextId ? ERAS[nextId] : null;
  const target = nextMeta?.name ?? UNIMPLEMENTED_NEXT[s.era] ?? '下一个时代';

  const handleAdvance = () => {
    if (!s.advanceEra()) {
      // 理论上按钮禁用时不应到达这里，兜底提示
      s.addMessage('跃迁条件尚未满足，无法进入下一个时代', 'warn');
    }
  };

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
        <h3 className="text-sm font-semibold text-gray-100">{`时代跃迁 · ${target}`}</h3>
        <span className={`text-xs ${check.ok ? 'text-green-400' : 'text-gray-400'}`}>
          {check.ok ? '条件已满足' : `还差 ${remaining} 项`}
        </span>
      </div>

      {/* 跃迁条件：达成 ✓ 绿色，未达成 ○ 灰色（条数与内容全部来自引擎） */}
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
        disabled={!check.ok || !nextMeta}
        onClick={handleAdvance}
        className={`w-full rounded py-2.5 font-semibold transition-all ${
          check.ok && nextMeta
            ? // 全部条件达成：加大加粗 + 亮翠绿 + 外发光 + 描边，做成页面最醒目的按钮
              'bg-emerald-500 text-base text-white ring-2 ring-emerald-300/70 shadow-[0_0_24px_-2px_rgba(16,185,129,0.95)] hover:bg-emerald-400 hover:ring-emerald-200'
            : 'cursor-not-allowed bg-gray-700 text-sm text-gray-500'
        }`}
      >
        {!nextMeta ? (
          `${target} · 尚未实装`
        ) : check.ok ? (
          <>
            <Icon emoji="🌾" className="text-base mr-1" />
            {`迈向${target}`}
          </>
        ) : (
          `迈向${target}（还差 ${remaining} 项）`
        )}
      </button>
    </div>
  );
}
