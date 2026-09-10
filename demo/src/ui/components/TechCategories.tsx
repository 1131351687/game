// 科技分类视图 · 按「文明进程的层级」分组展示 20 项科技（紧凑单行版）
//
// 与 TechTree.tsx（节点连线图）互补：
//   科技树回答"这条路通向哪里"，本视图回答"我现在在文明的哪一步"。
//   分类顺序固定为：文明之光（核心）→ 火之技艺 / 石器与工具 / 群体与定居（三条分支）→ 时代之门（门槛）。
//   每个类别内部再分「已学 / 未学」两组，未学组里又能一眼看出
//   "现在就能点" / "经验还差多少" / "前置没满足" 三种处境。
//
// 排版约定（v3 简约化）：
//   每条科技压成一行（36px 高），不再常驻渲染 desc —— 那是本视图此前最占空间的东西。
//   完整介绍（描述 / 成本 / 状态 / 效果）改到纯 CSS 悬停浮层里，移入即现、移出即隐。
//   视觉上刻意「去卡片化」：区块不再套边框与实心底色，改用留白 + 字重分层级；
//   行内的彩色状态块收敛为「左侧 2px 细色条 + 文字色变化」，避免整行染色。
//
// 图标约定（纯文字模式）：
//   所有 emoji（科技图标 / 🔒 / 💡）一律经 <Icon> 渲染，关闭图标时返回 null。
//   因此行内布局必须用 gap 建立间距，不能依赖图标自身宽度撑开。
//   类别色点是内联 style 画的色块，不是 emoji，保持原样。
//
// 本文件不依赖任何其它文件的改动，可独立编译。

import { useMemo } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useStore, toEngineState } from '../../state/store';
import { canResearch, isTechAvailable } from '../../game/engine';
import { isTechRevealed } from '../../game/reveal';
import {
  branchesOfEra,
  techsOfEraBranch,
  BRANCH_INFO,
  type TechBranch,
  type TechDef,
  type TechEffects,
} from '../../data/techs';
import { JOB_MAP } from '../../data/jobs';
import { BUILDING_MAP } from '../../data/buildings';
import { TOOL_TIERS } from '../../data/constants';
import { formatNumber } from '../../core/format';
import { Icon } from './Icon';

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
  /** 悬停浮层要展示的效果文案（预先算好，避免每次 hover 重算） */
  effectLines: string[];
  /** 当前经验（浮层里和成本对照显示） */
  experience: number;
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
//
// 简约化要点：行本身不再有边框，也不再整行染色。
// 状态差异由「背景的极淡变化 + 整体不透明度 + 文字色 + 左侧色条强度」共同表达。
// ─────────────────────────────────────────────
const ROW_CLASS: Record<TechState, string> = {
  // 已学：整体降对比度，不再吸引点击
  researched: 'opacity-55 cursor-default',
  // 可研究：唯一有 hover 反馈的行，暗示"可点击"
  ready: 'text-gray-100 hover:bg-gray-800/70 cursor-pointer',
  // 经验不足：hover 弱一点，提示"差一口气"
  short: 'opacity-90 hover:bg-gray-800/50 cursor-pointer',
  // 前置未满足：最暗
  locked: 'opacity-45 hover:bg-gray-800/30 cursor-pointer',
};

/** 左侧状态标记（✓ / ○ / 🔒）的颜色 —— 已学用低饱和绿，避免抢眼 */
const MARK_COLOR: Record<TechState, string> = {
  researched: 'text-emerald-500/70',
  ready: 'text-emerald-400',
  short: 'text-amber-400/80',
  locked: 'text-gray-600',
};

/** 右侧状态文案的颜色（浮层里的状态说明也复用这套） */
const STATUS_COLOR: Record<TechState, string> = {
  researched: 'text-gray-500',
  ready: 'text-emerald-400',
  short: 'text-amber-400/90',
  locked: 'text-gray-600',
};

/** 左侧状态标记：✓ 已学 / ○ 待办（锁定态改用 <Icon emoji="🔒"> 渲染） */
const STATUS_MARK: Record<Exclude<TechState, 'locked'>, string> = {
  researched: '✓',
  ready: '○',
  short: '○',
};

/** 科技类型 → 中文（浮层里显示，比 raw 的 type 字段好读） */
const TYPE_LABEL: Record<TechDef['type'], string> = {
  unlock: '解锁',
  qualitative: '质变',
  numeric: '数值',
  gate: '门槛',
};

// ─────────────────────────────────────────────
// 效果列表 → 中文文案
//
// 每个 renderer 负责一个 effect key：没有该 key 就返回 null 被过滤掉。
// 这样新增 effect 只需加一行，且天然保持定义顺序、类型安全（无 any）。
// ─────────────────────────────────────────────
const EFFECT_RENDERERS: ReadonlyArray<(e: TechEffects) => string | null> = [
  e => (e.enableFire ? '开启火种系统' : null),
  e => (e.activeFireRestore ? '可主动补充火种' : null),
  e =>
    e.fireDecayMultiplier !== undefined
      ? `火种衰减 ×${formatNumber(e.fireDecayMultiplier, 2)}`
      : null,
  e => (e.fireMaxBonus !== undefined ? `火种上限 +${formatNumber(e.fireMaxBonus)}` : null),
  e => (e.removeWeakFoodPenalty ? '火种微弱时不再有食物惩罚' : null),
  e => (e.foodMultiplier !== undefined ? `食物产出 ×${formatNumber(e.foodMultiplier, 2)}` : null),
  e => (e.stoneMultiplier !== undefined ? `石头产出 ×${formatNumber(e.stoneMultiplier, 2)}` : null),
  e => (e.expMultiplier !== undefined ? `经验产出 ×${formatNumber(e.expMultiplier, 2)}` : null),
  e =>
    e.gathererMultiplier !== undefined
      ? `采集者效率 ×${formatNumber(e.gathererMultiplier, 2)}`
      : null,
  e => {
    if (e.setToolTier === undefined) return null;
    const tier = TOOL_TIERS.find(t => t.level === e.setToolTier);
    return `工具世代 →「${tier?.name ?? `等级 ${e.setToolTier}`}」`;
  },
  e =>
    e.buildingCostMultiplier !== undefined
      ? `建筑成本 ×${formatNumber(e.buildingCostMultiplier, 2)}`
      : null,
  e => (e.stabilityBonus !== undefined ? `社会稳定 +${formatNumber(e.stabilityBonus)}` : null),
  // 集体围猎的两个字段一起读才成句，这里合成一条
  e => {
    if (e.huntPartyThreshold === undefined && e.huntPartyBonus === undefined) return null;
    const threshold = e.huntPartyThreshold ?? 0;
    const bonus = Math.round((e.huntPartyBonus ?? 0) * 100);
    return `猎人数达 ${threshold} 人时全员效率 +${bonus}%`;
  },
  e =>
    e.foodStorageMultiplier !== undefined
      ? `食物存储上限 ×${formatNumber(e.foodStorageMultiplier, 2)}`
      : null,
  e =>
    e.unlockJobs && e.unlockJobs.length > 0
      ? `解锁岗位：${e.unlockJobs.map(id => JOB_MAP[id]?.name ?? id).join('、')}`
      : null,
  e =>
    e.unlockBuildings && e.unlockBuildings.length > 0
      ? `解锁建筑：${e.unlockBuildings.map(id => BUILDING_MAP[id]?.name ?? id).join('、')}`
      : null,
  e => (e.enableAdvance ? '开启时代跃迁' : null),
];

/** 把一个科技的 effects 渲染成若干条中文说明（无效果时返回空数组） */
function describeEffects(effects: TechEffects): string[] {
  const out: string[] = [];
  for (const render of EFFECT_RENDERERS) {
    const line = render(effects);
    if (line !== null) out.push(line);
  }
  return out;
}

// ─────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────
export function TechCategories() {
  // 订阅整个 state：经验 / 科技 / 队列变化时自动重渲染
  const s = useStore();
  const view = useMemo(() => toEngineState(s), [s]);

  // 队列用 Set 做 O(1) 查询（队列很短，但避免每行都 includes 扫一遍）
  const queueSet = useMemo(() => new Set(s.queue), [s.queue]);

  // ── 组装当前时代的类别区块（只列本时代科技，已传承的上一时代科技不再重复列出）──
  const groups = useMemo<BranchGroup[]>(() => {
    return branchesOfEra(s.era).map(branch => {
      const all = techsOfEraBranch(s.era, branch);
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
          effectLines: describeEffects(def.effects),
          experience: view.experience,
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
  /** 左键：能研究就立即研究（瞬时，无读条），不能研究就给明确反馈（绝不静默忽略） */
  const handleClick = (row: TechRow): void => {
    if (row.state === 'researched') {
      // 已完成的项目：只做轻提示，不重复研究
      s.addMessage(`「${row.def.name}」已经学过了`, 'all');
      return;
    }
    // 以引擎的实时判定为准（与行上的视觉状态同源）
    if (canResearch(row.def.id, view).ok) {
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

  // ── 空状态：同样去掉边框，只留留白 ──
  if (visibleCount === 0) {
    return (
      <section className="space-y-4">
        <div className="rounded-md bg-gray-800/40 px-4 py-8 text-center text-sm text-gray-500">
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
          // 注意：此处不能加 overflow-hidden，否则行内的悬停浮层会被裁掉。
          // 也不用卡片：区块之间靠 space-y-4 的留白分隔。
          <div key={group.branch}>
            {/* ── 类别标题行：色点 + 名称 + role 标签 + 右侧进度（全部小号灰淡） ── */}
            <div className="flex items-center gap-2 px-1">
              {/* 类别色点：内联 style 画的色块，不是 emoji，纯文字模式下也保留 */}
              <span
                className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: info.color }}
                aria-hidden="true"
              />
              <h3 className="text-xs font-medium tracking-wide text-gray-300">{info.name}</h3>
              <span className="text-[11px] text-gray-600">{info.role}</span>
              <span className="ml-auto text-[11px] text-gray-600 tabular-nums">
                <span className="text-gray-400">{group.done}</span>
                <span className="text-gray-700"> / {group.total}</span>
              </span>
            </div>

            {/* ── 类别副标题：这条路线解决什么问题 ── */}
            <div className="px-1 mt-0.5 text-[11px] text-gray-600">{info.desc}</div>

            {empty ? (
              <div className="px-1 mt-2 text-xs text-gray-600">
                该类别暂无可见科技 —— 继续研究前置科技以解锁。
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {/* ── 已学组 ── */}
                {group.researched.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="px-1 text-[10px] uppercase tracking-wide text-gray-600">
                      已学
                    </div>
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
                  <div className="space-y-0.5">
                    <div className="px-1 text-[10px] uppercase tracking-wide text-gray-600">
                      未学
                    </div>
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
// 单条科技：一行 36px
//   [状态标记] [2px 分支色条] [图标] [名称（截断）] ... [成本] [队列中] [状态区]
//   整行是一个 <button>，所以行内所有元素都用 <span>（button 只允许短语内容）。
//   行内所有间距全部由父级 gap-2 提供 —— 纯文字模式下图标返回 null 也不会错位。
// ─────────────────────────────────────────────
interface TechItemProps {
  row: TechRow;
  onClick: (row: TechRow) => void;
  onContextMenu: (e: ReactMouseEvent<HTMLElement>, row: TechRow) => void;
}

function TechItem({ row, onClick, onContextMenu }: TechItemProps) {
  const { def, state } = row;

  // 左侧分支色条强度随状态变化，让同一类别内的条目也有视觉锚点
  const accentOpacity =
    state === 'researched' ? 0.3 : state === 'ready' ? 0.9 : state === 'short' ? 0.45 : 0.2;

  return (
    // group + relative：悬停浮层的定位与显隐都靠这两个类
    <button
      type="button"
      onClick={() => onClick(row)}
      onContextMenu={e => onContextMenu(e, row)}
      className={`group relative w-full h-9 flex items-center gap-2 rounded-md pl-3 pr-2 text-left transition-colors ${ROW_CLASS[state]}`}
    >
      {/* 左侧 2px 细色条：贴在行左边缘，取代原先整行的彩色边框 */}
      <span
        className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full"
        style={{ backgroundColor: BRANCH_INFO[def.branch].color, opacity: accentOpacity }}
        aria-hidden="true"
      />

      {/* 状态标记：✓ / ○ 是界面符号；🔒 是 emoji，走 <Icon> */}
      <span
        className={`w-4 shrink-0 text-center text-xs leading-none ${MARK_COLOR[state]}`}
        aria-hidden="true"
      >
        {state === 'locked' ? <Icon emoji="🔒" className="text-[11px]" /> : STATUS_MARK[state]}
      </span>

      {/* 科技图标（可能为 null，靠 gap 维持间距） */}
      <Icon emoji={def.icon} className="text-base leading-none shrink-0" />

      {/* 名称：唯一的弹性列，过长截断不换行 */}
      <span
        className={`flex-1 min-w-0 truncate text-sm font-medium ${
          state === 'locked' ? 'text-gray-500' : state === 'researched' ? 'text-gray-500' : 'text-gray-100'
        }`}
      >
        {def.name}
      </span>

      {/* 成本 */}
      <span className="shrink-0 inline-flex items-center gap-1 text-xs text-gray-600 tabular-nums">
        {formatNumber(def.cost)}
        <Icon emoji="💡" className="text-[10px]" />
      </span>

      {row.queued && state !== 'researched' && (
        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-sm bg-sky-500/10 text-sky-400/90">
          队列中
        </span>
      )}

      {/* 右侧状态区 */}
      <span
        className={`shrink-0 w-28 text-right text-xs whitespace-nowrap ${STATUS_COLOR[state]}`}
      >
        {state === 'researched' && <span>已学</span>}
        {state === 'ready' && (
          // 整条本身已是 <button>，这里用 span 做按钮外观（避免嵌套 button 的非法 HTML）。
          // 这是本视图唯一"可点击"的强提示，因此保留一点颜色，但不再用实心块。
          <span className="font-medium">研究</span>
        )}
        {state === 'short' && (
          <span className="inline-flex items-center gap-1">
            还差 {formatNumber(row.deficit)}
            <Icon emoji="💡" className="text-[10px]" />
          </span>
        )}
        {state === 'locked' && (
          <span className="inline-block max-w-full truncate align-middle">
            {row.reason ?? '前置未满足'}
          </span>
        )}
      </span>

      {/* 悬停浮层：完整介绍（纯 CSS 显隐，不需要 JS 状态） */}
      <TechTooltip row={row} />
    </button>
  );
}

// ─────────────────────────────────────────────
// 悬停浮层：名称 + 类别 / 描述 / 成本与经验 / 状态说明 / 效果列表
//
// 定位在行的下方右侧（top-full + right-0）：行的宽度足以容纳 w-64，
// 且不会像 left-full 那样把卡片推到视口外。
// pointer-events-none：浮层不抢指针，鼠标仍停留在行上，移出即隐。
// 配色比 v2 更素：去掉亮边框，改用极淡 ring + 高不透明度底色。
// ─────────────────────────────────────────────
function TechTooltip({ row }: { row: TechRow }) {
  const { def, state } = row;
  const info = BRANCH_INFO[def.branch];

  // 状态说明：把四种处境翻译成一句人话
  let statusText: string;
  switch (state) {
    case 'researched':
      statusText = '已学 · 效果已生效';
      break;
    case 'ready':
      statusText = '可研究：经验充足，点击立即学习';
      break;
    case 'short':
      statusText = `经验不足：还差 ${formatNumber(row.deficit)} 经验`;
      break;
    case 'locked':
      statusText = `前置未满足：${row.reason ?? '前置未满足'}`;
      break;
  }

  return (
    <span
      role="tooltip"
      className="hidden group-hover:block pointer-events-none absolute right-0 top-full mt-1 z-50 w-64 rounded-md bg-gray-900/95 p-3 text-left shadow-xl ring-1 ring-gray-800"
    >
      {/* 名称 + 类别 */}
      <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-100">
        <Icon emoji={def.icon} className="text-sm" />
        <span>{def.name}</span>
      </span>
      <span className="block mt-0.5 text-[11px] text-gray-500">
        {info.name} · {TYPE_LABEL[def.type]}
      </span>

      {/* 完整描述 */}
      <span className="block mt-1.5 text-xs leading-snug text-gray-400">{def.desc}</span>

      {/* 成本与当前经验 */}
      <span className="mt-2 pt-1.5 border-t border-gray-800 flex items-center gap-1 text-[11px] text-gray-500 tabular-nums">
        成本 {formatNumber(def.cost)} · 当前经验 {formatNumber(row.experience)}
        <Icon emoji="💡" className="text-[10px]" />
      </span>

      {/* 状态说明 */}
      <span className={`block mt-1 text-[11px] ${STATUS_COLOR[state]}`}>{statusText}</span>

      {/* 效果列表 */}
      {row.effectLines.length > 0 && (
        <span className="block mt-2 pt-1.5 border-t border-gray-800">
          <span className="block text-[10px] uppercase tracking-wide text-gray-500">效果</span>
          {row.effectLines.map(line => (
            <span key={line} className="block mt-0.5 text-[11px] text-gray-300">
              · {line}
            </span>
          ))}
        </span>
      )}

      {row.queued && <span className="block mt-1.5 text-[11px] text-sky-400/80">已加入研究队列（右键可再次加入）</span>}
    </span>
  );
}

export default TechCategories;
