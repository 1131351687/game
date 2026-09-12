// UI 改包：竖屏/横屏双模式 + 自由切换 + B 方案点击展开（抽屉式）
// 用法：main.tsx 里把 App 指向本文件即可。无需改动任何引擎/Store 逻辑。
// 特点：
//  - 布局模式「自动 / 竖屏 / 横屏」可手动切换，选择存 localStorage，刷新后保留。
//    默认跟随窗口宽度（≤768px 竖屏，否则横屏）。
//  - 竖屏：顶部极简状态栏 + "状态抽屉" 点击展开 + 底部粘性 Tab + 主内容全宽。
//  - 横屏：左侧栏常驻（时代 + 资源 TopBar + 火种/季节/记录/贸易/提示 全部收进左栏），
//    中间内容区 Tab 切换，右侧消息日志栏。
//  - 纯 UI 层改动，原 App.tsx 保留未动，回退只需改回 main.tsx 的 import。
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useStore, toEngineState } from '../state/store';
import { TopBar } from './components/TopBar';
import { FireDashboard } from './components/FireDashboard';
import { SeasonBar } from './components/SeasonBar';
import { RecordPanel } from './components/RecordPanel';
import { TradePanel } from './components/TradePanel';
import { JobPanel } from './components/JobPanel';
import { BuildingPanel } from './components/BuildingPanel';
import { CivilizationPanel } from './components/CivilizationPanel';
import { SettingsMenu } from './components/SettingsMenu';
import { HintBar } from './components/HintBar';
import { MessageLog } from './components/MessageLog';
import { Icon } from './components/Icon';
import { isModuleUnlocked } from '../game/reveal';
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

/** 竖屏用的点击展开抽屉 */
function Drawer({ title, icon, children }: { title: string; icon?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md bg-gray-900/40">
      <button onClick={() => setOpen(v => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800/60">
        {icon && <Icon emoji={icon} className="text-sm" />}
        <span className="flex-1 text-left">{title}</span>
        <span className="text-xs text-gray-500">{open ? '收起 ▴' : '展开 ▾'}</span>
      </button>
      {open && <div className="border-t border-gray-800 px-3 py-3">{children}</div>}
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
        <div className="space-y-2 px-3 py-2">
          <Drawer title="状态" icon="📊">
            <div className="space-y-2">
              {fireUnlocked && <FireDashboard />}
              <SeasonBar />
              <RecordPanel />
              <TradePanel />
              <HintBar />
            </div>
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

  // 横屏：左侧资源/状态栏 + 中间内容 + 右侧消息栏
  return (
    <div className="flex h-screen text-gray-200">
      {/* ① 左侧栏：时代 / 资源 / 状态面板全部常驻于此 */}
      <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-gray-800 bg-gray-900/20">
        {/* 栏头：时代标识 + 布局切换 + 设置 */}
        <div className="flex shrink-0 items-center gap-1 border-b border-gray-800 px-2 py-1.5">
          <div className="min-w-0 flex-1 truncate font-display text-sm text-accent">{ERAS[s.era].name}</div>
          <LayoutToggle pref={pref} onChange={setPref} />
          <SettingsMenu />
        </div>

        {/* 资源条：纵向栏内保留横向滚动（资源多时不出竖向断行） */}
        <TopBar />

        {/* 状态面板自上而下堆叠 */}
        <div className="space-y-2 p-2">
          {fireUnlocked && <FireDashboard />}
          <SeasonBar />
          <RecordPanel />
          <TradePanel />
          <HintBar />
        </div>
      </aside>

      {/* ② 中间内容区：Tab + 面板 */}
      <main className="min-w-0 flex-1 overflow-y-auto p-4">
        <nav className="flex gap-6 border-b border-gray-800 px-2">
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
      <aside className="w-80 shrink-0 overflow-y-auto border-l border-gray-800">
        <MessageLog />
      </aside>
    </div>
  );
}
