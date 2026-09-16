// ═══════════════════════════════════════════════════════════════════
// UI 更新包 V2 · 自适应双模式外壳（AppShellV2）
// ═══════════════════════════════════════════════════════════════════
//
// 【这是什么】
//   一个可直接替换 `src/ui/AppResponsiveB.tsx` 的布局外壳。
//   纯 UI 层改动：不碰 engine / store / data，任何游戏逻辑零风险。
//
// 【怎么接入】
//   1) 把本文件放到 `demo/src/ui/AppShellV2.tsx`
//   2) 改 `demo/src/main.tsx` 一行：
//        import App from './ui/AppShellV2';     // 原来是 './ui/AppResponsiveB'
//   3) 回退：把那行改回去即可。旧文件完全不删、不动。
//
// 【相对 AppResponsiveB 的改进】
//   ① 状态栏不再被埋进折叠抽屉
//      横屏：季节/火种以「芯片条」常驻内容区顶部，一眼可见，不占左栏高度
//      竖屏：保留抽屉（屏幕窄，必须省），但抽屉默认展开、标题带当季摘要
//   ② Tab 栏去重：竖横屏共用同一套 Tab 定义与渲染，不再两处各写一遍
//      改一次 Tab 两边同时生效（旧版漏改一处就会出现"横屏有贸易、竖屏没有"）
//   ③ 键盘操作：1/2/3/4 切 Tab，Esc 关闭抽屉/设置
//   ④ 左栏可拖拽调宽（横屏），宽度记进 localStorage
//   ⑤ 移动端适配：dvh 高度（避开手机地址栏抖动）、safe-area 内边距
//   ⑥ 消息栏统一：竖屏贴底、横屏成独立右栏，展开态高度自适应
//   ⑦ 主题/图标开关沿用全局设置，所有 emoji 一律经 <Icon>
//   ⑧ 无障碍：Tab 用 role="tablist"，当前项 aria-selected
//
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore, toEngineState } from '../state/store';
import { TopBar, E2_RESOURCE_ORDER, E3_RESOURCE_ORDER, E4_RESOURCE_ORDER } from './components/TopBar';
import {
  MATERIAL_RESOURCES,
  RESOURCE_MAP,
  researchCurrencyName,
  type ResourceId,
} from '../data/resources';
import { isResourceRevealed, isModuleUnlocked } from '../game/reveal';
import {
  calcExperienceOutput,
  getAdminLoad,
  getGovernanceCoverage,
  getLegacyBonus,
  getOrderRegime,
  getStabilityRate,
  getNetResourceRate,
  getResourceStorage,
  getCapacity,
  getPopulationGrowth,
} from '../game/engine';
import { formatNumber, formatRate } from '../core/format';
import { buildOutputTitle, buildStorageTitle } from './components/resourceTooltips';
import { FireDashboard } from './components/FireDashboard';
import { SeasonBar } from './components/SeasonBar';
import { TradePanel } from './components/TradePanel';
import { JobPanel } from './components/JobPanel';
import { BuildingPanel } from './components/BuildingPanel';
import { CivilizationPanel } from './components/CivilizationPanel';
import { SettingsMenu } from './components/SettingsMenu';
import { MessageLog } from './components/MessageLog';
import { Icon } from './components/Icon';
import { ERAS } from '../data/era';

// ─────────────────────────────────────────────
// 类型与常量
// ─────────────────────────────────────────────

type TabId = 'work' | 'buildings' | 'trade' | 'civilization';
type LayoutPref = 'auto' | 'vertical' | 'horizontal';

const LAYOUT_KEY = 'civilis.layout';
/** 左栏宽度（横屏）：记住玩家拖出来的宽度 */
const RAIL_WIDTH_KEY = 'civilis.railWidth';
const RAIL_MIN = 180;
const RAIL_MAX = 420;
const RAIL_DEFAULT = 240;

function readLayoutPref(): LayoutPref {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    return v === 'vertical' || v === 'horizontal' || v === 'auto' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function writeLayoutPref(v: LayoutPref): void {
  try {
    localStorage.setItem(LAYOUT_KEY, v);
  } catch {
    /* 隐私模式下静默降级为不记忆 */
  }
}

function readRailWidth(): number {
  try {
    const v = Number(localStorage.getItem(RAIL_WIDTH_KEY));
    return Number.isFinite(v) && v >= RAIL_MIN && v <= RAIL_MAX ? v : RAIL_DEFAULT;
  } catch {
    return RAIL_DEFAULT;
  }
}

function writeRailWidth(v: number): void {
  try {
    localStorage.setItem(RAIL_WIDTH_KEY, String(Math.round(v)));
  } catch {
    /* 同上 */
  }
}

// ─────────────────────────────────────────────
// 布局 hook：手动偏好 + 窗口宽度 → 实际是否竖屏
// ─────────────────────────────────────────────

function useLayout(): [boolean, LayoutPref, (p: LayoutPref) => void] {
  const [pref, setPref] = useState<LayoutPref>(readLayoutPref);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  const apply = useCallback((p: LayoutPref) => {
    setPref(p);
    writeLayoutPref(p);
  }, []);

  const isVertical = pref === 'vertical' || (pref === 'auto' && narrow);
  return [isVertical, pref, apply];
}

/** Esc 关闭最上层的浮层（抽屉 / 设置）：全局只在这里注册一次 */
function useEscape(onEscape: () => void): void {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onEscape]);
}

// ─────────────────────────────────────────────
// 小组件
// ─────────────────────────────────────────────

/** 布局切换：自动 → 竖屏 → 横屏 循环 */
function LayoutToggle({ pref, onChange }: { pref: LayoutPref; onChange: (p: LayoutPref) => void }) {
  const next: Record<LayoutPref, { p: LayoutPref; label: string; icon: string }> = {
    auto: { p: 'vertical', label: '竖屏', icon: '📱' },
    vertical: { p: 'horizontal', label: '横屏', icon: '🖥️' },
    horizontal: { p: 'auto', label: '自动', icon: '🔁' },
  };
  const t = next[pref];
  const current = pref === 'auto' ? '自动（跟随窗口）' : pref === 'vertical' ? '竖屏' : '横屏';
  return (
    <button
      type="button"
      onClick={() => onChange(t.p)}
      title={`当前：${current}，点击切换为${t.label}`}
      aria-label="切换布局"
      className="flex h-10 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-gray-100"
    >
      <Icon emoji={t.icon} className="text-sm" />
      <span className="hidden sm:inline">{pref === 'auto' ? '自动' : t.label}</span>
    </button>
  );
}

/**
 * 左栏资源数据表：名称左 / 数值右 / 速率定宽。
 * 与 TopBar 共用同一套顺序与引擎算法，只是排版变成竖向表格。
 */
function ResourceList() {
  const s = useStore();
  const view = toEngineState(s);

  const order: ResourceId[] =
    s.era === 'E4'
      ? E4_RESOURCE_ORDER
      : s.era === 'E3'
        ? E3_RESOURCE_ORDER
        : s.era === 'E2'
          ? E2_RESOURCE_ORDER
          : MATERIAL_RESOURCES;
  const shown = order.filter(id => isResourceRevealed(id, view));
  const popGrowth = getPopulationGrowth(view);
  const capacity = getCapacity(view);

  const rateColor = (r: number) =>
    r > 0 ? 'text-emerald-400/70' : r < 0 ? 'text-red-400/70' : 'text-gray-600';

  return (
    <div>
      {shown.map(id => {
        const def = RESOURCE_MAP[id];
        const rate = id === 'experience' ? calcExperienceOutput(view) : getNetResourceRate(id, view);
        const cap = getResourceStorage(id, view);
        const amount =
          id === 'experience'
            ? s.experience
            : (s[
                id as
                  | 'food'
                  | 'wood'
                  | 'stone'
                  | 'livestock'
                  | 'fabric'
                  | 'copper'
                  | 'tin'
                  | 'bronze'
                  | 'lapis'
                  | 'iron'
                  | 'coin'
              ] as number);
        const displayName = id === 'experience' ? researchCurrencyName(s.era) : def.name;

        return (
          <div
            key={id}
            className="flex items-baseline gap-2 border-b border-gray-800/60 py-2 last:border-b-0"
          >
            <span className="flex items-center gap-1.5" title={buildOutputTitle(id, view)}>
              <Icon emoji={def.icon} className="text-xs text-gray-500" />
              <span className="text-xs text-gray-500">{displayName}</span>
            </span>
            <span
              className="ml-auto font-mono text-xs tabular-nums text-gray-100"
              title={buildStorageTitle(id, view)}
            >
              {formatNumber(amount)}
            </span>
            {Number.isFinite(cap) && (
              <span className="font-mono text-[10px] tabular-nums text-gray-600">
                /{formatNumber(cap)}
              </span>
            )}
            <span
              className={`w-14 shrink-0 text-right font-mono text-[10px] tabular-nums ${rateColor(rate)}`}
            >
              {formatRate(rate)}
            </span>
          </div>
        );
      })}

      {/* 人口行：与资源行同构，保持表格节奏 */}
      <div className="flex items-baseline gap-2 py-2">
        <Icon emoji={RESOURCE_MAP.population.icon} className="text-xs text-gray-500" />
        <span className="text-xs text-gray-500">人口</span>
        <span className="ml-auto font-mono text-xs tabular-nums text-gray-100">
          {Math.floor(s.population)}
          <span className="text-[10px] text-gray-600">/{capacity}</span>
        </span>
        <span
          className={`w-14 shrink-0 text-right font-mono text-[10px] tabular-nums ${rateColor(popGrowth)}`}
        >
          {formatRate(popGrowth)}
        </span>
      </div>
    </div>
  );
}

/**
 * 顶部状态条（横屏专用）。
 *
 * 解决的问题：旧版把 SeasonBar 塞进左栏折叠抽屉 —— 横屏本来最不缺横向空间，
 * 结果反而要看季节得先点开抽屉，信息被藏起来了。
 *
 * 实现要点：FireDashboard 与 SeasonBar 各自渲染成一个自带
 * `border-b + px-4 py-2` 的横条（它们本来就是「常驻横条」的设计）。
 * 所以这里**不能再套一层带 border/padding 的容器** —— 那会出现双边框、
 * 双重内边距。正确做法是让它们各自作为兄弟节点直接堆叠。
 *
 * 各自内部已处理"未开启就 return null"：
 *   FireDashboard → 非 E1 或未研究「掌握火」时为 null
 *   SeasonBar     → 未开启季节循环时为 null
 * 因此这里无需再做条件判断（判断反而会与组件内部逻辑重复、易漏改）。
 */
function E4StatusChips() {
  const s = useStore();
  const view = toEngineState(s);
  if (s.era !== 'E4') return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-gray-800 px-4 py-2 text-xs text-gray-500">
      <span className="font-semibold text-accent">帝国治理</span>
      <span>秩序 <b className={s.order >= 80 ? 'text-green-400' : s.order >= 50 ? 'text-amber-300' : 'text-red-400'}>{Math.round(s.order)}</b></span>
      <span>状态 <b className="text-gray-300">{getOrderRegime(view).name}</b></span>
      <span>覆盖 κ <b className="text-gray-300">{getGovernanceCoverage(view).toFixed(2)}</b></span>
      <span>维稳 ρ <b className="text-gray-300">{(getStabilityRate(view) * 100).toFixed(0)}%</b></span>
      <span>负荷 <b className="text-gray-300">{getAdminLoad(view).toFixed(1)}</b></span>
      <span>版图 <b className="text-gray-300">{s.territory}</b></span>
      {s.p1Unlocked && <span>遗产 <b className="text-cyan-300">{s.legacyPoints} · ×{getLegacyBonus(view).toFixed(2)}</b></span>}
    </div>
  );
}

function StatusChips() {
  return (
    <>
      <FireDashboard />
      <SeasonBar />
      <E4StatusChips />
    </>
  );
}

/** Tab 栏：竖横屏共用（旧版两处各写一遍，极易漏改） */
function TabBar({
  tabs,
  active,
  onSelect,
  variant,
}: {
  tabs: { id: TabId; label: string; icon: string }[];
  active: TabId;
  onSelect: (t: TabId) => void;
  variant: 'top' | 'bottom';
}) {
  if (variant === 'bottom') {
    return (
      <nav
        role="tablist"
        className="flex shrink-0 items-center justify-around border-t border-gray-800 bg-gray-950/90 px-2 pb-[env(safe-area-inset-bottom)] pt-1.5"
      >
        {tabs.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            onClick={() => onSelect(t.id)}
            className={`flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-xs transition-colors ${
              active === t.id ? 'text-accent' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Icon emoji={t.icon} className="text-lg" />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    );
  }

  return (
    <nav role="tablist" className="flex gap-1 overflow-x-auto border-b border-gray-800">
      {tabs.map(t => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onSelect(t.id)}
          className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors ${
            active === t.id
              ? 'border-accent text-gray-100'
              : 'border-transparent text-gray-500 hover:text-gray-200'
          }`}
        >
          {/* 必须走 <Icon>：裸 emoji 会绕过「显示图标」开关 */}
          <Icon emoji={t.icon} className="text-sm" />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

/** 左栏宽度拖拽把手（横屏） */
function RailResizer({ onDrag }: { onDrag: (dx: number) => void }) {
  const startX = useRef(0);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    startX.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="调整左栏宽度"
      onPointerDown={onPointerDown}
      onPointerMove={e => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const dx = e.clientX - startX.current;
        startX.current = e.clientX;
        onDrag(dx);
      }}
      className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-accent/40"
    />
  );
}

// ─────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────

export default function AppShellV2() {
  const s = useStore();
  const view = toEngineState(s);
  const [isVertical, pref, setPref] = useLayout();
  const [railWidth, setRailWidth] = useState(readRailWidth);

  const showBuildings = isModuleUnlocked('buildings', view);
  const fireUnlocked = isModuleUnlocked('fire', view);
  const showTrade = !!s.techs['caravan_org'];

  const [tab, setTab] = useState<TabId>('civilization');
  /** 竖屏状态抽屉的开关 —— 由 Esc 与标题按钮共同控制 */
  const [drawerOpen, setDrawerOpen] = useState(false);

  const tabs = useMemo(() => {
    const list: { id: TabId; label: string; icon: string }[] = [
      { id: 'work', label: '工作', icon: '👥' },
    ];
    if (showBuildings) list.push({ id: 'buildings', label: '建筑', icon: '🏕️' });
    if (showTrade) list.push({ id: 'trade', label: '贸易', icon: '🐪' });
    list.push({ id: 'civilization', label: '文明', icon: '🔬' });
    return list;
  }, [showBuildings, showTrade]);

  // 当前 Tab 在解锁状态变化后可能失效（如导入旧存档）→ 回落到文明
  useEffect(() => {
    if (!tabs.some(t => t.id === tab)) setTab('civilization');
  }, [tabs, tab]);

  // 键盘：1..4 切 Tab，Esc 收起抽屉
  useEscape(useCallback(() => setDrawerOpen(false), []));
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      // 输入框内不劫持数字键（存档导入框里要能打字）
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= tabs.length) setTab(tabs[n - 1].id);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [tabs]);

  const handleRailDrag = useCallback((dx: number) => {
    setRailWidth(w => {
      const next = Math.min(RAIL_MAX, Math.max(RAIL_MIN, w + dx));
      writeRailWidth(next);
      return next;
    });
  }, []);

  /** 状态摘要（抽屉收起时显示，避免"收起即失明"） */
  const drawerSummary = useMemo(() => {
    if (s.era === 'E1') return fireUnlocked ? '火种' : '';
    return s.era === 'E2' ? '季节 · 越冬' : '状态';
  }, [s.era, fireUnlocked]);

  const panel = (
    <>
      {tab === 'work' && <JobPanel />}
      {tab === 'buildings' && <BuildingPanel />}
      {tab === 'trade' && <TradePanel />}
      {tab === 'civilization' && <CivilizationPanel />}
    </>
  );

  // ═══ 竖屏 ═══
  if (isVertical) {
    return (
      <div className="flex h-[100dvh] flex-col text-gray-200">
        {/* 顶部：时代 + 资源条 + 布局/设置 */}
        <div className="shrink-0 border-b border-gray-800 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-center font-display text-xs text-accent">
              {ERAS[s.era].name}
            </span>
            <div className="min-w-0 flex-1 overflow-x-auto">
              <TopBar />
            </div>
            <LayoutToggle pref={pref} onChange={setPref} />
            <SettingsMenu />
          </div>
        </div>

        {/* 状态抽屉：受控开关（Esc 可收） */}
        <div className="shrink-0">
          <div className="border-b border-gray-800">
            <button
              type="button"
              onClick={() => setDrawerOpen(v => !v)}
              aria-expanded={drawerOpen}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-gray-400 transition-colors hover:text-gray-100"
            >
              <Icon emoji="📊" className="text-sm" />
              <span className="shrink-0 font-medium">状态</span>
              {!drawerOpen && drawerSummary && (
                <span className="min-w-0 flex-1 truncate text-xs text-gray-500">
                  {drawerSummary}
                </span>
              )}
              <span className={`shrink-0 text-xs text-gray-600 ${drawerOpen ? '' : 'ml-auto'}`}>
                {drawerOpen ? '收起 ▴' : '展开 ▾'}
              </span>
            </button>
            {drawerOpen && (
              <div className="space-y-2 px-3 pb-3">
                {s.era === 'E1' && fireUnlocked && <FireDashboard />}
                <SeasonBar />
                <E4StatusChips />
              </div>
            )}
          </div>
        </div>

        {/* 主内容 */}
        <main className="min-h-0 flex-1 overflow-y-auto px-3 py-3">{panel}</main>

        {/* 消息栏（文档流内，不被底部 Tab 遮挡） */}
        <MessageLog />

        <TabBar tabs={tabs} active={tab} onSelect={setTab} variant="bottom" />
      </div>
    );
  }

  // ═══ 横屏 ═══
  return (
    <div className="flex h-[100dvh] text-gray-200">
      {/* 左栏：时代 + 资源表 + 状态抽屉 */}
      <aside
        className="flex shrink-0 flex-col overflow-y-auto border-r border-gray-800"
        style={{ width: railWidth }}
      >
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-gray-800 px-3">
          <span className="min-w-0 flex-1 truncate font-display text-sm text-accent">
            {ERAS[s.era].name}
          </span>
          <LayoutToggle pref={pref} onChange={setPref} />
          <SettingsMenu />
        </div>

        <div className="px-3 pt-1">
          <ResourceList />
        </div>

      </aside>

      <RailResizer onDrag={handleRailDrag} />

      {/* 中栏：状态芯片 + Tab + 面板 */}
      <main className="flex min-w-0 flex-1 flex-col">
        <StatusChips />

        <div className="shrink-0 px-3 pt-1">
          <TabBar tabs={tabs} active={tab} onSelect={setTab} variant="top" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 xl:p-4">{panel}</div>
      </main>

      {/* 右栏：消息 */}
      <aside className="w-64 shrink-0 overflow-y-auto border-l border-gray-800 xl:w-80">
        <MessageLog />
      </aside>
    </div>
  );
}
