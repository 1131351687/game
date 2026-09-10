// 根组件 · E1 远古时代
//
// 渐进解锁原则：开局只给玩家看两件事 —— 「派人采集」与「点亮掌握火」。
// 其余模块随研究进度逐步放出，避免信息过载。

import { useState } from 'react';
import { useStore, toEngineState } from './state/store';
import { FireDashboard } from './ui/components/FireDashboard';
import { TechTree } from './ui/components/TechTree';
import { ResourcePanel } from './ui/components/ResourcePanel';
import { JobPanel } from './ui/components/JobPanel';
import { BuildingPanel } from './ui/components/BuildingPanel';
import { QueuePanel } from './ui/components/QueuePanel';
import { HintBar } from './ui/components/HintBar';
import { AdvancePanel } from './ui/components/AdvancePanel';
import { MessageLog } from './ui/components/MessageLog';
import { OpeningView } from './ui/components/OpeningView';
import { isModuleUnlocked } from './game/reveal';
import type { UiModule } from './game/reveal';

const MODULE_LABEL: Record<UiModule, { label: string; icon: string }> = {
  fire: { label: '火种', icon: '🔥' },
  production: { label: '生产', icon: '📦' },
  buildings: { label: '建筑', icon: '🏕️' },
  queue: { label: '研究队列', icon: '📋' },
  advance: { label: '时代跃迁', icon: '🚀' },
};

type TabId = 'tech' | UiModule;

export default function App() {
  const s = useStore();
  const view = toEngineState(s);
  const [tab, setTab] = useState<TabId>('tech');

  const fireUnlocked = isModuleUnlocked('fire', view);
  const modules = (['production', 'buildings', 'queue', 'advance'] as UiModule[]).filter(m =>
    isModuleUnlocked(m, view)
  );

  // 开局：尚未掌握火 —— 走极简单页，不显示 Tab 栏
  if (!fireUnlocked) {
    return (
      <div className="h-screen flex flex-col bg-gray-900 text-gray-200">
        <OpeningView />
        <MessageLog />
      </div>
    );
  }

  // 已有模块时显示 Tab 栏；否则只显示科技树
  const tabs: TabId[] = ['tech', ...modules];
  const showTabBar = tabs.length > 1;

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-200">
      {/* 火种仪表盘 —— 掌握火之后的常驻核心元素 */}
      <FireDashboard />

      {/* 卡点提示（无卡点时不渲染） */}
      <HintBar />

      {/* Tab 栏：模块多于一页时才出现 */}
      {showTabBar && (
        <nav className="flex gap-1 px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
          {tabs.map(t => {
            const info = t === 'tech' ? { label: '科技树', icon: '🔬' } : MODULE_LABEL[t];
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded text-sm transition-colors ${
                  tab === t ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {info.icon} {info.label}
              </button>
            );
          })}
        </nav>
      )}

      {/* 主内容区 */}
      <main className="flex-1 overflow-y-auto p-4">
        {tab === 'tech' && <TechTree />}
        {tab === 'production' && (
          <div className="space-y-6 max-w-4xl">
            <ResourcePanel />
            <JobPanel />
          </div>
        )}
        {tab === 'buildings' && (
          <div className="max-w-4xl">
            <BuildingPanel />
          </div>
        )}
        {tab === 'queue' && <QueuePanel />}
        {tab === 'advance' && <AdvancePanel />}
      </main>

      {/* 消息日志 */}
      <MessageLog />
    </div>
  );
}
