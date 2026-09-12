// UI 改包：竖屏/横屏双模式 + B 方案点击展开（抽屉式）
// 用法：main.tsx 里把 App 指向本文件即可。无需改动任何引擎/Store 逻辑。
// 特点：
//  - 竖屏（≤768px）：顶部极简状态栏 + "状态抽屉" 点击展开 + 底部粘性 Tab + 主内容全宽。
//  - 横屏（>768px）：状态面板常驻 + 右侧消息栏，内容区保留原有布局。
//  - 纯 UI 层改动，未来合并成本极低。原 App.tsx 保留未动，想回退只需改回 main.tsx 的 import。
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

function useLayoutMode() {
  const [isVertical, setIsVertical] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsVertical(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return isVertical;
}

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

export default function AppResponsiveB() {
  const s = useStore();
  const view = toEngineState(s);
  const isVertical = useLayoutMode();
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

  // 横屏：状态常驻 + 右侧消息栏
  return (
    <div className="flex h-screen flex-col text-gray-200">
      <div className="flex items-stretch border-b border-gray-800">
        <div className="w-24 shrink-0 items-center justify-center bg-gray-900/40 text-sm text-accent">{ERAS[s.era].name}</div>
        <div className="min-w-0 flex-1"><TopBar /></div>
        <SettingsMenu />
      </div>

      {fireUnlocked && <FireDashboard />}
      <SeasonBar />
      <RecordPanel />
      <TradePanel />
      <HintBar />

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-4">
          <nav className="flex gap-6 border-b border-gray-800 px-4">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`-mb-px border-b-2 px-1 py-3 text-sm ${tab === t.id ? 'border-accent text-gray-100' : 'border-transparent text-gray-500 hover:text-gray-200'}`}>
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
        <aside className="w-[360px] shrink-0 border-l border-gray-800 overflow-y-auto">
          <MessageLog />
        </aside>
      </div>
    </div>
  );
}
