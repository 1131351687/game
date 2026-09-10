// 科技分类视图 · 按「文明进程的层级」分组展示 20 项科技
//
// 与 TechTree.tsx（节点连线图）互补：
//   科技树回答"这条路通向哪里"，本视图回答"我现在在文明的哪一步"。
//   分类顺序固定为：文明之光（核心）→ 火之技艺 / 石器与工具 / 群体与定居（三条分支）→ 时代之门（门槛）。
//   每个类别内部再分「已学 / 未学」两组，未学组里又能一眼看出
//   "现在就能点" / "经验还差多少" / "前置没满足" 三种处境。
//
// 本文件不依赖任何其它文件的改动，可独立编译。

import { useMemo } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useStore, toEngineState } from '../../state/store';
import { canResearch, isTechAvailable } from '../../game/engine';
import { isTechRevealed } from '../../game/reveal';
import {
  TECHS_BY_BRANCH,
  BRANCH_INFO,
  BRANCH_ORDER,
  type TechBranch,
  type TechDef,
} from '../../data/techs';
import { formatNumber } from '../../core/format';

// ─────────────────────────────────────────────
// 单条科技的四种状态
// ─────────────────────────────────────────────
type TechState =
  /** 已学：整条略暗，作为"已完成的事"退到背景里 */
  | 'researched'
  /** 可研究：前置满足 + 经验足够，高亮并可点击 */
  | 'ready'
  /** 经验不足：前置满足，只差经验，半亮 */
  | 'short'
  /** 前置未满足：灰暗 50%，显示 🔒 与原因 */
  | 'locked';

interface TechRow {
  def: TechDef;
  state: TechState;
  /** canResearch 给出的失败原因（前置未满足 / 经验不足时用于展示） */
  reason: string | undefined;
  /** 经验不足时还差多少（向上取整） */
  deficit: number;
  /** 是否已在研究队列中 */
  queued: boolean;
}

interface BranchGroup {
  branch: TechBranch;
  /** 已学（按定义顺序） */
  researched: TechRow[];
  /** 未学（按定义顺序） */
  pending: TechRow[];
  /** 该类别科技总数（含尚未揭示的，让进度 `2 / 6` 反映分支真实体量） */
  total: number;
  /** 该类别已学数 */
  done: number;
}

// ─────────────────────────────────────────────
// 单条科技的视觉样式（四种状态必须一眼可分）
// ─────────────────────────────────────────────
const ROW_CLASS: Record<TechState, string> = {
  // 已学：低对比度、绿字 ✓，不再吸引点击
  researched: 'border-gray-700/70 bg-gray-800/50 opacity-70 cursor-default',
  // 可研究：亮边框 + 高亮文字，hover 加亮
  ready:
    'border-emerald-500/60 bg-gray-800 ring-1 ring-emerald-500/30 hover:bg-gray-700/80 hover:border-emerald-400 cursor-pointer',
  // 经验不足：正常底色但整体半亮，提示"差一口气"
  short: 'border-gray-600/70 bg-gray-800/80 opacity-90 hover:bg-gray-700/60 cursor-pointer',
  // 前置未满足：灰暗 50%
  locked: 'border-gray-800 bg-gray-800/40 opacity-50 cursor-pointer',
};

/** 右侧状态文案的颜色 */
const STATUS_COLOR: Record<TechState, string> = {
  researched: 'text-emerald-400',
  ready: 'text-emerald-300',
  short: 'text-amber-400',
  locked: 'text-gray-500',
};

// ─────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────
export function TechCategories() {
  // 订阅整个 state：经验 / 科技 / 队列变化时自动重渲染
  const s = useStore();
  const view = useMemo(() => toEngineState(s), [s]);

  // 队列用 Set 做 O(1) 查询（队列很短，但避免每行都 includes 扫一遍）
  const queueSet = useMemo(() => new Set(s.queue), [s.queue]);

  // ── 组装 5 个类别区块 ──
  const groups = useMemo<BranchGroup[]>(() => {
    return BRANCH_ORDER.map(branch => {
      const all = TECHS_BY_BRANCH[branch];
      const rows: TechRow[] = [];

      for (const def of all) {
        // 渐进揭示：未揭示的科技根本不渲染（已学的恒为可见）
        if (!isTechRevealed(def.id, view)) continue;

        const researched = view.techs[def.id] === true;
        const check = canResearch(def.id, view);
        // 前置满足与否（不论经验够不够）
        const available = isTechAvailable(def.id, view);

        let state: TechState;
        if (researched) state = 'researched';
        else if (check.ok) state = 'ready';
        else if (available) state = 'short';
        else state = 'locked';

        rows.push({
          def,
          state,
          reason: check.reason,
          deficit: Math.max(0, Math.ceil(def.cost - view.experience)),
          queued: queueSet.has(def.id),
        });
      }

      return {
        branch,
        researched: rows.filter(r => r.state === 'researched'),
        pending: rows.filter(r => r.state !== 'researched'),
        total: all.length,
        // 已学数按全类别统计，与 total 口径一致
        done: all.filter(d => view.techs[d.id] === true).length,
      };
    });
  }, [view, queueSet]);

  // 所有类别都没有可见科技 → 空状态
  const visibleCount = groups.reduce((n, g) => n + g.researched.length + g.pending.length, 0);

  // ── 交互 ──
  /** 左键：能研究就研究，不能研究就给明确反馈（绝不静默忽略） */
  const handleClick = (row: TechRow): void => {
    if (row.state === 'researched') return; // 已完成的项目，点击无需打扰
    if (row.state === 'ready') {
      s.research(row.def.id);
      return;
    }
    // 经验不足 / 前置未满足：把引擎给出的原因原样告诉玩家
    s.addMessage(`${row.def.name}：${row.reason ?? '暂时无法研究'}`, 'warn');
  };

  /** 右键：加入研究队列（已学或已在队列中的跳过） */
  const handleContextMenu = (e: ReactMouseEvent<HTMLElement>, row: TechRow): void => {
    e.preventDefault();
    if (row.state === 'researched' || row.queued) return;
    s.enqueue(row.def.id);
  };

  // ── 空状态 ──
  if (visibleCount === 0) {
    return (
      <section className="space-y-4">
        <div className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-8 text-center text-sm text-gray-400">
          暂无可研究的科技 —— 先派族人去采集与积累经验。
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {groups.map(group => {
        const info = BRANCH_INFO[group.branch];
        const empty = group.researched.length === 0 && group.pending.length === 0;

        return (
          <div
            key={group.branch}
            className="rounded-lg border border-gray-700 bg-gray-800 overflow-hidden"
          >
            {/* ── 类别标题行：色点 + 名称 + role 标签 + 右侧进度 ── */}
            <div className="flex items-center gap-2 px-4 pt-3">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: info.color }}
                aria-hidden="true"
              />
              <h3 className="text-base font-semibold text-gray-100">{info.name}</h3>
              <span className="text-xs text-gray-500">{info.role}</span>
              <span className="ml-auto text-sm text-gray-400 tabular-nums">
                <span className="text-gray-200 font-semibold">{group.done}</span>
                <span className="text-gray-500"> / {group.total}</span>
              </span>
            </div>

            {/* ── 类别副标题：这条路线解决什么问题 ── */}
            <div className="px-4 pb-3 text-xs text-gray-500">{info.desc}</div>

            {empty ? (
              <div className="px-4 pb-4 -mt-1 text-xs text-gray-600">
                该类别暂无可见科技 —— 继续研究前置科技以解锁。
              </div>
            ) : (
              <div className="px-3 pb-3 space-y-3">
                {/* ── 已学组 ── */}
                {group.researched.length > 0 && (
                  <div className="space-y-1">
                    <div className="px-1 text-[11px] text-gray-500">已学</div>
                    {group.researched.map(row => (
                      <TechItem
                        key={row.def.id}
                        row={row}
                        onClick={handleClick}
                        onContextMenu={handleContextMenu}
                      />
                    ))}
                  </div>
                )}

                {/* ── 未学组 ── */}
                {group.pending.length > 0 && (
                  <div className="space-y-1">
                    <div className="px-1 text-[11px] text-gray-500">未学</div>
                    {group.pending.map(row => (
                      <TechItem
                        key={row.def.id}
                        row={row}
                        onClick={handleClick}
                        onContextMenu={handleContextMenu}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

// ─────────────────────────────────────────────
// 单条科技
// ─────────────────────────────────────────────
interface TechItemProps {
  row: TechRow;
  onClick: (row: TechRow) => void;
  onContextMenu: (e: ReactMouseEvent<HTMLElement>, row: TechRow) => void;
}

function TechItem({ row, onClick, onContextMenu }: TechItemProps) {
  const { def, state } = row;
  const info = BRANCH_INFO[def.branch];

  // 左侧分支色竖条强度随状态变化，让同一类别内的条目也有视觉锚点
  const accentOpacity = state === 'researched' ? 0.25 : state === 'ready' ? 1 : state === 'short' ? 0.5 : 0.2;

  return (
    <button
      type="button"
      onClick={() => onClick(row)}
      onContextMenu={e => onContextMenu(e, row)}
      title={def.desc}
      className={`w-full flex items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${ROW_CLASS[state]}`}
    >
      {/* 分支色竖条 */}
      <span
        className="w-0.5 self-stretch rounded-full shrink-0"
        style={{ backgroundColor: info.color, opacity: accentOpacity }}
        aria-hidden="true"
      />

      <span className="text-lg leading-none shrink-0 pt-0.5">{def.icon}</span>

      {/* 名称 + 说明（已学省略说明以省空间） */}
      <span className="flex-1 min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span
            className={`text-sm font-medium truncate ${
              state === 'locked' ? 'text-gray-400' : 'text-gray-100'
            }`}
          >
            {def.name}
          </span>
          <span className="text-xs text-gray-500 shrink-0 tabular-nums">
            {formatNumber(def.cost)} 💡
          </span>
          {row.queued && state !== 'researched' && (
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-sky-900/70 text-sky-300">
              队列中
            </span>
          )}
        </span>

        {state !== 'researched' && (
          <span className="block text-[11px] text-gray-500 leading-snug mt-0.5">{def.desc}</span>
        )}
      </span>

      {/* 右侧状态区 */}
      <span className={`shrink-0 text-xs pt-0.5 whitespace-nowrap ${STATUS_COLOR[state]}`}>
        {state === 'researched' && <span>✓ 已学</span>}
        {state === 'ready' && (
          // 整条本身已是 <button>，这里用 span 做按钮外观（避免嵌套 button 的非法 HTML）
          <span className="inline-block px-2 py-0.5 rounded bg-emerald-600 text-white font-medium">
            研究
          </span>
        )}
        {state === 'short' && <span>还差 {formatNumber(row.deficit)} 💡</span>}
        {state === 'locked' && (
          <span className="inline-flex items-center gap-1 max-w-[16rem]">
            <span aria-hidden="true">🔒</span>
            <span className="truncate">{row.reason ?? '前置未满足'}</span>
          </span>
        )}
      </span>
    </button>
  );
}

export default TechCategories;
