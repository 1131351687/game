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
  E3: '铁器时代', // E4 尚未开放，只展示交接边界与 E3 完成状态
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
    // 极简处理：不再套卡片壳（bg + border + 圆角），内容直接坐在页面上，
    // 与其余面板保持一致——分层靠上方一条发丝线 + 留白，不靠底色块。
    // 「可以跃迁了」这个关键状态改用一条 ok 色顶线表达，比整块描边安静得多。
    <div
      className={`space-y-3 border-t-2 pt-3 transition-colors ${
        check.ok ? 'border-ok' : 'border-gray-800'
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
        className={`w-full rounded-md py-2.5 font-semibold transition-all ${
          check.ok && nextMeta
            ? // 主操作按钮：品牌强调色（余烬橙），这是"当前焦点"的落点。
              // 不加外发光/描边——极简方向下，醒目靠色块本身与字重，不靠特效。
              'bg-accent text-base text-white hover:bg-accent-strong'
            : 'cursor-not-allowed bg-gray-800 text-sm text-gray-600'
        }`}
      >
        {!nextMeta ? (
          check.ok
            ? `${target} · 交接待开放`
            : `${target} · 尚未开放`
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
