// 科技树界面 · E1 远古时代最核心的界面
//
// 布局：直接用 TechDef.position 的 x/y 坐标换算成世界像素坐标，
//       x = -2 火之技艺（左） / 0 中间 / +2 群体与定居（右）
//       y = 0 「掌握火」（底部） → y = 7 「植物栽培」（顶部门槛）
// 交互：拖拽平移 + 滚轮缩放（CSS transform）、悬停/点击看详情、点击研究、右键入队。
//
// 本文件不依赖任何其它文件的改动，可独立编译。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useStore, toEngineState } from '../../state/store';
import { canResearch, isTechAvailable, countResearched } from '../../game/engine';
import {
  TECHS,
  TECH_MAP,
  BRANCH_INFO,
  type TechDef,
  type TechBranch,
  type TechEffects,
} from '../../data/techs';
import { JOBS } from '../../data/jobs';
import { BUILDINGS } from '../../data/buildings';
import { QUEUE } from '../../data/constants';
import { formatNumber } from '../../core/format';

// ─────────────────────────────────────────────
// 世界坐标常量（像素）
// ─────────────────────────────────────────────
const NODE_W = 172;
const NODE_H = 66;
/** 三条纵向分支之间的水平间距 */
const COL_W = 232;
/** 相邻两代科技之间的垂直间距 */
const ROW_H = 104;
/** 世界左上角留白 */
const PAD_X = 330;
const PAD_Y = 40;
/** 布局中最靠上的 y（顶部门槛科技） */
const MAX_Y = Math.max(...TECHS.map(t => t.position.y));
/** 分支标题条的位置（在 y=0 那排节点下方） */
const FOOTER_Y = PAD_Y + (MAX_Y + 1) * ROW_H;

const WORLD_W = PAD_X * 2;
const WORLD_H = FOOTER_Y + 34;

/** 世界坐标：逻辑 x(-2/0/2) → 像素 */
const worldX = (x: number): number => PAD_X + (x / 2) * COL_W;
/** 世界坐标：逻辑 y(0 在底部) → 像素（屏幕 y 向下，故取反） */
const worldY = (y: number): number => PAD_Y + (MAX_Y - y) * ROW_H;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// id → 名称查表，用于把 effects 里的岗位/建筑 id 显示成中文名
const JOB_NAME = new Map<string, string>(JOBS.map(j => [String(j.id), j.name]));
const BUILDING_NAME = new Map<string, string>(BUILDINGS.map(b => [String(b.id), b.name]));

// ─────────────────────────────────────────────
// effects → 可读文案
// 逐个 key 显式取值（TechEffects 是 interface，没有隐式索引签名，
// 因此不能直接用 Object.entries 遍历）
// ─────────────────────────────────────────────
const EFFECT_LABEL: Record<keyof TechEffects, string> = {
  enableFire: '开启火种系统',
  activeFireRestore: '可主动补充火种',
  fireDecayMultiplier: '火种衰减 ×',
  fireMaxBonus: '火种上限 +',
  removeWeakFoodPenalty: '火种微弱不再扣食物',
  foodMultiplier: '食物产出 ×',
  stoneMultiplier: '石头产出 ×',
  expMultiplier: '经验产出 ×',
  gathererMultiplier: '采集效率 ×',
  setToolTier: '工具世代 →',
  buildingCostMultiplier: '建筑成本 ×',
  stabilityBonus: '群体稳定度 +',
  huntPartyThreshold: '围猎人数阈值 ',
  huntPartyBonus: '围猎效率加成 +',
  foodStorageMultiplier: '食物存储上限 ×',
  unlockJobs: '解锁岗位：',
  unlockBuildings: '解锁建筑：',
  enableAdvance: '开启时代跃迁',
};

const EFFECT_KEYS = Object.keys(EFFECT_LABEL) as (keyof TechEffects)[];

/** 单条效果的展示文案；返回 null 表示该项无效果 */
function describeEffect(key: keyof TechEffects, value: TechEffects[keyof TechEffects]): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? EFFECT_LABEL[key] : null;
  if (typeof value === 'number') return `${EFFECT_LABEL[key]}${formatNumber(value, 2)}`;
  if (Array.isArray(value)) {
    const names = (value as readonly string[]).map(id => JOB_NAME.get(id) ?? BUILDING_NAME.get(id) ?? id);
    return names.length > 0 ? `${EFFECT_LABEL[key]}${names.join('、')}` : null;
  }
  return null;
}

/** 科技类型角标 */
const TYPE_LABEL: Record<TechDef['type'], { text: string; cls: string }> = {
  unlock: { text: '解锁', cls: 'bg-blue-900/60 text-blue-300' },
  qualitative: { text: '质变', cls: 'bg-purple-900/60 text-purple-300' },
  numeric: { text: '数值', cls: 'bg-emerald-900/60 text-emerald-300' },
  gate: { text: '门槛', cls: 'bg-amber-900/60 text-amber-300' },
};

// ─────────────────────────────────────────────
// 节点派生状态
// ─────────────────────────────────────────────
type NodeState = 'researched' | 'ready' | 'short' | 'locked';

interface TechNode {
  def: TechDef;
  /** 节点左上角世界坐标 */
  nx: number;
  ny: number;
  state: NodeState;
  /** 可研究（前置满足 + 经验足够） */
  canDo: boolean;
  /** 前置满足但经验不够时，还差多少经验 */
  deficit: number;
  /** canResearch 给出的失败原因 */
  reason: string | undefined;
  queued: boolean;
  color: string;
}

interface TechEdge {
  from: string;
  to: string;
  /** 是否为 OR 前置（门槛科技的汇聚线） */
  or: boolean;
  /** 起点已研究 → 路径已打通 */
  active: boolean;
}

export function TechTree() {
  // 订阅整个 state：经验/科技/队列变化时自动重渲染
  const s = useStore();
  const view = useMemo(() => toEngineState(s), [s]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  // ── 视图变换：world → screen（translate + scale）──
  const [tf, setTf] = useState({ x: 0, y: 0, k: 1 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  /** 拖拽超过阈值后抑制随后的 click，避免误触研究 */
  const movedRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  // 初始视图：整体缩放到容器内，并把树的底部对齐容器底部
  const fitView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const k = clamp(Math.min((rect.width - 32) / WORLD_W, (rect.height - 32) / WORLD_H), 0.35, 1.2);
    setTf({ k, x: (rect.width - WORLD_W * k) / 2, y: rect.height - WORLD_H * k - 12 });
  }, []);

  useEffect(() => {
    fitView();
  }, [fitView]);

  // 滚轮缩放：以光标为锚点。React 的 onWheel 在根节点上是 passive 的，
  // 无法 preventDefault，因此用原生监听器（passive:false）自己绑。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setTf(prev => {
        const k = clamp(prev.k * Math.exp(-e.deltaY * 0.0015), 0.35, 2.5);
        // 保持光标下的世界坐标点不动
        const wx = (mx - prev.x) / prev.k;
        const wy = (my - prev.y) / prev.k;
        return { k, x: mx - wx * k, y: my - wy * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return; // 仅左键平移
    movedRef.current = false;
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: tf.x, oy: tf.y };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true;
    setTf(prev => ({ ...prev, x: d.ox + dx, y: d.oy + dy }));
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // ── 节点与连线（规则全部来自引擎，界面不重复实现）──
  const nodes = useMemo<TechNode[]>(() => {
    return TECHS.map(def => {
      const researched = view.techs[def.id] === true;
      const check = canResearch(def.id, view);
      const available = isTechAvailable(def.id, view);
      const canDo = check.ok;
      // 前置满足但经验不够：显示"还差 N"
      const deficit = Math.max(0, Math.ceil(def.cost - view.experience));
      let state: NodeState;
      if (researched) state = 'researched';
      else if (canDo) state = 'ready';
      else if (available) state = 'short';
      else state = 'locked';
      return {
        def,
        nx: worldX(def.position.x),
        ny: worldY(def.position.y),
        state,
        canDo,
        deficit,
        reason: check.reason,
        queued: s.queue.includes(def.id),
        color: BRANCH_INFO[def.branch].color,
      };
    });
  }, [view, s.queue]);

  const nodeById = useMemo(() => new Map(nodes.map(n => [n.def.id, n])), [nodes]);

  const edges = useMemo<TechEdge[]>(() => {
    const list: TechEdge[] = [];
    for (const def of TECHS) {
      for (const req of def.requires) {
        list.push({ from: req, to: def.id, or: false, active: view.techs[req] === true });
      }
      for (const req of def.requiresAny ?? []) {
        list.push({ from: req, to: def.id, or: true, active: view.techs[req] === true });
      }
    }
    return list;
  }, [view]);

  // 详情面板：优先显示悬停节点，其次是点击选中的节点
  const activeId = hoverId ?? selectedId;
  const active = activeId ? nodeById.get(activeId) : undefined;
  const researchedCount = countResearched(view);
  const queueFull = s.queue.length >= QUEUE.MAX_LENGTH;

  const handleResearch = (id: string): void => {
    if (s.research(id)) setSelectedId(id);
  };

  const zoomBy = (factor: number): void => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    setTf(prev => {
      const k = clamp(prev.k * factor, 0.35, 2.5);
      const wx = (cx - prev.x) / prev.k;
      const wy = (cy - prev.y) / prev.k;
      return { k, x: cx - wx * k, y: cy - wy * k };
    });
  };

  return (
    <div className="flex flex-col w-full h-full min-h-[520px] bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
      {/* 呼吸发光动画（Tailwind 默认没有这组 keyframes，只能就地注入） */}
      <style>{`
        @keyframes ttPulse {
          0%, 100% { box-shadow: 0 0 5px -1px currentColor; transform: scale(1); }
          50%      { box-shadow: 0 0 18px 3px currentColor; transform: scale(1.03); }
        }
      `}</style>

      {/* ── 顶部信息条 ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 text-sm">
        <span className="text-gray-300">
          经验：<span className="text-yellow-300 font-semibold">{formatNumber(view.experience)}</span> 💡
        </span>
        <span className="text-gray-300">
          已研究：<span className="text-emerald-400 font-semibold">{researchedCount}</span>
          <span className="text-gray-500"> / {TECHS.length}</span>
        </span>
        <span className="text-gray-400">
          研究队列：<span className="text-sky-300">{s.queue.length}</span>
          <span className="text-gray-500"> / {QUEUE.MAX_LENGTH}</span>
          {s.queue.length > 0 && (
            <span className="ml-2 text-gray-500">
              {s.queue.map(id => TECH_MAP[id]?.name ?? id).join(' → ')}
            </span>
          )}
        </span>

        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className="hidden md:inline text-gray-500">拖拽平移 · 滚轮缩放 · 悬停看详情 · 右键入队</span>
          <button
            type="button"
            onClick={() => zoomBy(1.2)}
            className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
          >
            ＋
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.2)}
            className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
          >
            −
          </button>
          <button
            type="button"
            onClick={fitView}
            className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
          >
            重置视图
          </button>
        </div>
      </div>

      {/* ── 画布 ── */}
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`relative flex-1 overflow-hidden touch-none select-none ${
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {/* 世界层：内部全部使用世界坐标，靠这一层 transform 实现平移/缩放 */}
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: WORLD_W,
            height: WORLD_H,
            transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.k})`,
          }}
        >
          {/* 连线（SVG 与节点共用同一套世界坐标） */}
          <svg className="absolute left-0 top-0 pointer-events-none" width={WORLD_W} height={WORLD_H}>
            {edges.map(edge => {
              const a = nodeById.get(edge.from);
              const b = nodeById.get(edge.to);
              if (!a || !b) return null;
              // 起点在下方（世界 y 更大）→ 从源节点顶部连到目标节点底部
              const sx = a.nx + NODE_W / 2;
              const sy = a.ny;
              const tx = b.nx + NODE_W / 2;
              const ty = b.ny + NODE_H;
              const midY = (sy + ty) / 2;
              const d = `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
              const color = edge.active ? BRANCH_INFO[b.def.branch].color : '#4b5563';
              return (
                <path
                  key={`${edge.from}->${edge.to}`}
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={edge.active ? 3 : 1.5}
                  strokeDasharray={edge.or ? '6 5' : undefined}
                  opacity={edge.active ? 0.9 : 0.45}
                />
              );
            })}
          </svg>

          {/* 分支标题（放在树底部三列下方） */}
          {(['fire', 'tool', 'society'] as TechBranch[]).map((branch, i) => {
            const info = BRANCH_INFO[branch];
            return (
              <div
                key={branch}
                className="absolute text-center"
                style={{
                  left: worldX([-2, 0, 2][i]) - COL_W / 2 + 8,
                  top: FOOTER_Y,
                  width: COL_W - 16,
                }}
              >
                <div className="text-sm font-semibold" style={{ color: info.color }}>
                  {info.name}
                </div>
                <div className="text-[11px] text-gray-500 truncate">{info.desc}</div>
              </div>
            );
          })}

          {/* 节点 · 四态 */}
          {nodes.map(node => {
            const { def, state, color } = node;
            const isActive = activeId === def.id;
            const style: CSSProperties = {
              left: node.nx,
              top: node.ny,
              width: NODE_W,
              height: NODE_H,
              color,
            };
            let cls = 'absolute rounded-xl border-2 px-3 flex items-center gap-2 transition-colors ';
            if (state === 'researched') {
              // 已研究：实心点亮、分支色、✓
              style.backgroundColor = color;
              style.borderColor = color;
              style.boxShadow = '0 0 10px -2px currentColor';
              cls += 'cursor-default';
            } else if (state === 'ready') {
              // 可研究：发光呼吸、可点击
              style.backgroundColor = 'rgba(17,24,39,0.95)';
              style.borderColor = color;
              style.animation = 'ttPulse 1.8s ease-in-out infinite';
              cls += 'cursor-pointer hover:brightness-125';
            } else if (state === 'short') {
              // 前置满足但经验不够：半亮 + 显示还差多少
              style.backgroundColor = 'rgba(31,41,55,0.9)';
              style.borderColor = '#6b7280';
              style.opacity = 0.9;
              cls += 'cursor-pointer';
            } else {
              // 前置未满足：灰暗
              style.backgroundColor = 'rgba(17,24,39,0.7)';
              style.borderColor = '#374151';
              style.opacity = 0.45;
              style.color = '#6b7280';
              cls += 'cursor-not-allowed';
            }
            if (isActive) cls += ' ring-2 ring-white/70';

            // 节点上直接显示成本 / 还差多少
            let costLine: string;
            if (state === 'researched') costLine = '已研究';
            else if (state === 'short') costLine = `还差 ${formatNumber(node.deficit)}`;
            else costLine = `${formatNumber(def.cost)} 💡`;

            return (
              <button
                type="button"
                key={def.id}
                style={style}
                className={cls}
                onMouseEnter={() => setHoverId(def.id)}
                onMouseLeave={() => setHoverId(prev => (prev === def.id ? null : prev))}
                onContextMenu={e => {
                  e.preventDefault();
                  if (state !== 'researched') s.enqueue(def.id);
                }}
                onClick={() => {
                  if (movedRef.current) return; // 拖拽结束后的误触
                  setSelectedId(def.id);
                  if (node.canDo) handleResearch(def.id);
                }}
                title={def.name}
              >
                <span className="text-xl leading-none" style={{ opacity: state === 'locked' ? 0.6 : 1 }}>
                  {def.icon}
                </span>
                <span className="flex-1 min-w-0 text-left">
                  <span
                    className={`block text-[13px] font-semibold truncate ${
                      state === 'researched' ? 'text-white' : 'text-gray-100'
                    }`}
                  >
                    {def.name}
                  </span>
                  <span
                    className={`block text-[11px] truncate ${
                      state === 'researched'
                        ? 'text-white/80'
                        : state === 'short'
                          ? 'text-amber-400'
                          : 'text-gray-400'
                    }`}
                  >
                    {costLine}
                  </span>
                </span>
                {state === 'researched' && <span className="text-white text-lg">✓</span>}
                {state === 'ready' && <span className="text-lg">▶</span>}
                {state !== 'researched' && node.queued && (
                  <span className="absolute -top-2 -right-2 text-[10px] px-1.5 py-0.5 rounded-full bg-sky-700 text-white">
                    队列
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── 详情面板（固定在容器右上角，不随世界层缩放）── */}
        {active && (
          <div className="absolute right-3 top-3 w-80 max-h-[calc(100%-1.5rem)] overflow-y-auto bg-gray-800/95 border border-gray-700 rounded-lg p-4 shadow-2xl text-sm">
            <div className="flex items-start gap-2">
              <span className="text-2xl leading-none">{active.def.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-100">{active.def.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_LABEL[active.def.type].cls}`}>
                    {TYPE_LABEL[active.def.type].text}
                  </span>
                </div>
                <div className="text-xs mt-0.5" style={{ color: active.color }}>
                  {BRANCH_INFO[active.def.branch].name}
                </div>
              </div>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-300"
                onClick={() => {
                  setSelectedId(null);
                  setHoverId(null);
                }}
              >
                ✕
              </button>
            </div>

            <p className="mt-3 text-gray-300 leading-relaxed">{active.def.desc}</p>

            {/* 成本与状态：reason 直接取自 canResearch */}
            <div className="mt-3 space-y-1">
              <div className="text-gray-400">
                成本：<span className="text-yellow-300">{formatNumber(active.def.cost)}</span> 💡
                {active.state === 'short' && (
                  <span className="ml-2 text-amber-400">还差 {formatNumber(active.deficit)}</span>
                )}
              </div>
              <div
                className={
                  active.state === 'researched' || active.canDo
                    ? 'text-emerald-400'
                    : active.state === 'short'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                }
              >
                {active.state === 'researched'
                  ? '✓ 已研究'
                  : active.canDo
                    ? '可以研究'
                    : (active.reason ?? '前置未满足')}
              </div>
            </div>

            {/* 前置 */}
            {(active.def.requires.length > 0 || (active.def.requiresAny?.length ?? 0) > 0) && (
              <div className="mt-3">
                <div className="text-xs text-gray-500 mb-1">
                  {active.def.requires.length > 0 ? '前置（全部满足）' : '前置（任选其一）'}
                </div>
                <ul className="space-y-0.5">
                  {active.def.requires.map(id => (
                    <li key={id} className={view.techs[id] ? 'text-emerald-400' : 'text-gray-400'}>
                      {view.techs[id] ? '✓' : '○'} {TECH_MAP[id]?.name ?? id}
                    </li>
                  ))}
                  {(active.def.requiresAny ?? []).map(id => (
                    <li key={id} className={view.techs[id] ? 'text-emerald-400' : 'text-gray-400'}>
                      {view.techs[id] ? '✓' : '○'} {TECH_MAP[id]?.name ?? id}
                      <span className="text-gray-600"> （或）</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 效果 */}
            <div className="mt-3">
              <div className="text-xs text-gray-500 mb-1">效果</div>
              <ul className="space-y-0.5 text-gray-300">
                {EFFECT_KEYS.map(key => {
                  const text = describeEffect(key, active.def.effects[key]);
                  return text ? <li key={key}>· {text}</li> : null;
                })}
              </ul>
            </div>

            {/* 操作 */}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={!active.canDo}
                onClick={() => handleResearch(active.def.id)}
                className="flex-1 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-medium transition-colors"
              >
                {active.state === 'researched' ? '已研究' : `研究（${formatNumber(active.def.cost)} 💡）`}
              </button>
              <button
                type="button"
                disabled={active.state === 'researched' || active.queued || queueFull}
                onClick={() => s.enqueue(active.def.id)}
                className="px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white transition-colors"
              >
                {active.queued ? '已入队' : queueFull ? '队列已满' : '加入队列'}
              </button>
            </div>
            <div className="mt-2 text-[11px] text-gray-500">提示：也可以直接右键节点加入研究队列。</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TechTree;
