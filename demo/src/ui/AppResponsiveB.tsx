// UI 改包：竖屏/横屏双模式 + 自由切换 + 简约左栏
// 用法：main.tsx 里把 App 指向本文件即可。无需改动任何引擎/Store 逻辑。
//
// 设计方向（极简 / 工业实用）：
//  - 横屏左栏默认只露三样东西：时代标记、等宽数字的资源数据表、一行默认收起的「状态」抽屉。
//  - 资源用密集数据行呈现（名称左 / 数值右 / 速率定宽），只用发丝线分行，不用卡片盒子。
//  - 火种 / 季节 / 记录 / 贸易 / 提示全部收进「状态」抽屉，点开才占空间。
//  - 强调色只留给时代名 —— 全栏其余内容一律灰阶。
//  - 竖屏保持抽屉形态；布局三态（自动/竖屏/横屏）存 localStorage。
//  - 纯 UI 层改动，原 App.tsx 保留未动，回退只需改回 main.tsx 的 import。
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useStore, toEngineState } from '../state/store';
import { TopBar, E2_RESOURCE_ORDER, E3_RESOURCE_ORDER } from './components/TopBar';
import {
  MATERIAL_RESOURCES,
  RESOURCE_MAP,
  researchCurrencyName,
  type ResourceId,
} from '../data/resources';
import { isResourceRevealed, isModuleUnlocked } from '../game/reveal';
import {
  calcResourceOutput,
  calcExperienceOutput,
  getResourceStorage,
  getCapacity,
  getPopulationGrowth,
} from '../game/engine';
import { formatNumber, formatRate } from '../core/format';
import { FireDashboard } from './components/FireDashboard';
import { SeasonBar } from './components/SeasonBar';
import { TradePanel } from './components/TradePanel';
import { JobPanel } from './components/JobPanel';
import { BuildingPanel } from './components/BuildingPanel';
import { CivilizationPanel } from './components/CivilizationPanel';
import { SettingsMenu } from './components/SettingsMenu';
import { HintBar } from './components/HintBar';
import { MessageLog } from './components/MessageLog';
import { Icon } from './components/Icon';
import { ERAS } from '../data/era';

type TabId = 'work' | 'buildings' | 'civilization';
/** 布局偏好：auto 跟随窗口宽度；手动选择后持久化 */
type LayoutPref = 'auto' | 'vertical' | 'horizontal';

const LAYOUT_KEY = 'civilis.layout';

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
    /* 无 localStorage（隐私模式等）时静默降级为不记忆 */
  }
}

/**
 * 布局状态：手动偏好 + 窗口宽度 → 实际是否竖屏。
 * 返回 [isVertical, pref, setPref]，供切换按钮使用。
 */
function useLayout(): [boolean, LayoutPref, (p: LayoutPref) => void] {
  const [pref, setPref] = useState<LayoutPref>(readLayoutPref);
  const [windowNarrow, setWindowNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setWindowNarrow(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  const applyPref = (p: LayoutPref) => {
    setPref(p);
    writeLayoutPref(p);
  };

  const isVertical = pref === 'vertical' || (pref === 'auto' && windowNarrow);
  return [isVertical, pref, applyPref];
}

/** 点击展开抽屉（扁平化：只用发丝线，不套卡片盒；竖横屏共用） */
function Drawer({ title, icon, children }: { title: string; icon?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-800">
      <button onClick={() => setOpen(v => !v)} className="flex w-full items-center gap-2 px-1 py-2.5 text-sm text-gray-400 transition-colors hover:text-gray-100">
        {icon && <Icon emoji={icon} className="text-sm" />}
        <span className="flex-1 text-left">{title}</span>
        <span className="text-xs text-gray-600">{open ? '收起 ▴' : '展开 ▾'}</span>
      </button>
      {open && <div className="space-y-2 px-1 py-3">{children}</div>}
    </div>
  );
}

/** 布局切换按钮：自动 → 竖屏 → 横屏 循环；点一次即固定为该模式 */
function LayoutToggle({ pref, onChange }: { pref: LayoutPref; onChange: (p: LayoutPref) => void }) {
  const next: Record<LayoutPref, { p: LayoutPref; label: string; icon: string }> = {
    auto: { p: 'vertical', label: '竖屏', icon: '📱' },
    vertical: { p: 'horizontal', label: '横屏', icon: '🖥️' },
    horizontal: { p: 'auto', label: '自动', icon: '🔁' },
  };
  const t = next[pref];
  const label = pref === 'auto' ? '布局·自动' : `切${t.label}`;
  return (
    <button
      type="button"
      onClick={() => onChange(t.p)}
      title={`当前：${pref === 'auto' ? '自动（跟随窗口宽度）' : pref === 'vertical' ? '竖屏' : '横屏'}，点击切换为${t.label}`}
      aria-label="切换布局"
      className="flex h-10 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-gray-100"
    >
      <Icon emoji={t.icon} className="text-sm" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/**
 * 资源数据表 —— 左栏专用的极简呈现（TopBar 的竖向变体）。
 * 与 TopBar 共享同一套资源顺序与引擎计算，只是排版改为：
 * 名称左对齐、数值右对齐（等宽 + tabular-nums 防抖动）、速率定宽、发丝线分行。
 * 速率正负着色沿用全局约定：正=翠绿、负=红、零=灰（70% 透明度保持灰阶主导）。
 */
function ResourceList() {
  const s = useStore();
  const view = toEngineState(s);

  const order: ResourceId[] =
    s.era === 'E3' ? E3_RESOURCE_ORDER : s.era === 'E2' ? E2_RESOURCE_ORDER : MATERIAL_RESOURCES;
  const shown = order.filter(id => isResourceRevealed(id, view));
  const popGrowth = getPopulationGrowth(view);
  const capacity = getCapacity(view);

  const rateColor = (r: number) =>
    r > 0 ? 'text-emerald-400/70' : r < 0 ? 'text-red-400/70' : 'text-gray-600';

  return (
    <div>
      {shown.map(id => {
        const def = RESOURCE_MAP[id];
        const rate = id === 'experience' ? calcExperienceOutput(view) : calcResourceOutput(id, view);
        const cap = getResourceStorage(id, view);
        const amount =
          id === 'experience'
            ? s.experience
            : (s[id as 'food' | 'wood' | 'stone' | 'livestock' | 'fabric' | 'copper' | 'tin' | 'bronze' | 'lapis'] as number);
        const displayName = id === 'experience' ? researchCurrencyName(s.era) : def.name;

        return (
          <div key={id} className="flex items-baseline gap-2 border-b border-gray-800/60 py-2 last:border-b-0">
            <Icon emoji={def.icon} className="text-xs text-gray-500" />
            <span className="text-xs text-gray-500">{displayName}</span>
            <span className="ml-auto font-mono text-xs tabular-nums text-gray-100">
              {formatNumber(amount)}
            </span>
            {Number.isFinite(cap) && (
              <span className="font-mono text-[10px] tabular-nums text-gray-600">
                /{formatNumber(cap)}
              </span>
            )}
            {/* 速率定宽右对齐：位数变化不推挤其他列 */}
            <span className={`w-14 shrink-0 text-right font-mono text-[10px] tabular-nums ${rateColor(rate)}`}>
              {formatRate(rate)}
            </span>
          </div>
        );
      })}

      {/* 人口行：与资源行同构，保持表格节奏一致 */}
      <div className="flex items-baseline gap-2 py-2">
        <Icon emoji={RESOURCE_MAP.population.icon} className="text-xs text-gray-500" />
        <span className="text-xs text-gray-500">人口</span>
        <span className="ml-auto font-mono text-xs tabular-nums text-gray-100">
          {Math.floor(s.population)}
          <span className="text-[10px] text-gray-600">/{capacity}</span>
        </span>
        <span className={`w-14 shrink-0 text-right font-mono text-[10px] tabular-nums ${rateColor(popGrowth)}`}>
          {formatRate(popGrowth)}
        </span>
      </div>
    </div>
  );
}

export default function AppResponsiveB() {
  const s = useStore();
  const view = toEngineState(s);
  const [isVertical, pref, setPref] = useLayout();
  const showBuildings = isModuleUnlocked('buildings', view);
  const fireUnlocked = isModuleUnlocked('fire', view);

  const [tab, setTab] = useState<TabId>('civilization');

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'work', label: '工作', icon: '👥' },
    ...(showBuildings ? [{ id: 'buildings' as const, label: '建筑', icon: '🏕️' }] : []),
    { id: 'civilization', label: '文明', icon: '🔬' },
  ];

  // 竖屏：抽屉式
  if (isVertical) {
    return (
      <div className="flex h-screen flex-col text-gray-200">
        {/* 顶部极简状态栏 */}
        <div className="shrink-0 border-b border-gray-800 px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="w-20 shrink-0 text-center text-xs text-accent">{ERAS[s.era].name}</div>
            <div className="min-w-0 flex-1 overflow-x-auto"><TopBar /></div>
            <LayoutToggle pref={pref} onChange={setPref} />
            <SettingsMenu />
          </div>
        </div>

        {/* 状态抽屉：点击展开 */}
        <div className="px-3 py-2">
          <Drawer title="状态" icon="📊">
            {fireUnlocked && <FireDashboard />}
            <SeasonBar />
            <TradePanel />
            <HintBar />
          </Drawer>
        </div>

        {/* 主内容 */}
        <main className="flex-1 overflow-y-auto px-3 pb-20">
          {tab === 'work' && <JobPanel />}
          {tab === 'buildings' && <BuildingPanel />}
          {tab === 'civilization' && <CivilizationPanel />}
        </main>

        {/* 底部粘性 Tab */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-gray-800 bg-gray-950/90 px-2 py-2">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-col items-center gap-1 px-3 py-1 text-xs ${tab === t.id ? 'text-gray-100' : 'text-gray-500'}`}>
              <Icon emoji={t.icon} className="text-lg" />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <MessageLog />
      </div>
    );
  }

  // 横屏：极简三栏 —— 左（数据）/ 中（内容）/ 右（消息）
  return (
    <div className="flex h-screen text-gray-200">
      {/* ① 左侧栏：默认视图只有 时代 + 资源表 + 状态抽屉入口 */}
      <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-gray-800 xl:w-72">
        {/* 栏头：时代名是全栏唯一的强调色落点 */}
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-gray-800 px-3">
          <span className="min-w-0 flex-1 truncate font-display text-sm text-accent">
            {ERAS[s.era].name}
          </span>
          <LayoutToggle pref={pref} onChange={setPref} />
          <SettingsMenu />
        </div>

        {/* 资源数据表 */}
        <div className="px-3 pt-1">
          <ResourceList />
        </div>

        {/* 状态抽屉：火种/季节/记录/贸易/提示 默认收起 */}
        <div className="px-3 pb-3">
          <Drawer title="状态" icon="📊">
            {fireUnlocked && <FireDashboard />}
            <SeasonBar />
            <TradePanel />
            <HintBar />
          </Drawer>
        </div>
      </aside>

      {/* ② 中间内容区：Tab + 面板 */}
      <main className="min-w-[24rem] flex-1 overflow-y-auto p-3 xl:p-4">
        <nav className="flex gap-4 border-b border-gray-800 px-1 xl:gap-6 xl:px-2">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`-mb-px border-b-2 px-1 py-3 text-sm transition-colors ${tab === t.id ? 'border-accent text-gray-100' : 'border-transparent text-gray-500 hover:text-gray-200'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
        <div className="mt-4">
          {tab === 'work' && <div className="mx-auto max-w-4xl"><JobPanel /></div>}
          {tab === 'buildings' && <div className="mx-auto max-w-4xl"><BuildingPanel /></div>}
          {tab === 'civilization' && <CivilizationPanel />}
        </div>
      </main>

      {/* ③ 右侧消息栏 */}
      <aside className="w-64 shrink-0 overflow-y-auto border-l border-gray-800 xl:w-80">
        <MessageLog />
      </aside>
    </div>
  );
}
