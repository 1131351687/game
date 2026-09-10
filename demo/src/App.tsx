// 根组件 · E1 远古时代
// 布局：顶部火种仪表盘（常驻）→ 卡点提示 → Tabs → 内容区 → 底部消息日志

import { useState } from 'react';
import { FireDashboard } from './ui/components/FireDashboard';
import { TechTree } from './ui/components/TechTree';
import { ResourcePanel } from './ui/components/ResourcePanel';
import { JobPanel } from './ui/components/JobPanel';
import { BuildingPanel } from './ui/components/BuildingPanel';
import { QueuePanel } from './ui/components/QueuePanel';
import { HintBar } from './ui/components/HintBar';
import { AdvancePanel } from './ui/components/AdvancePanel';
import { MessageLog } from './ui/components/MessageLog';

type TabId = 'tech' | 'production' | 'queue' | 'advance';

const TABS: { id: TabId; label: string }[] = [
  { id: 'tech', label: '🔬 科技树' },
  { id: 'production', label: '📦 生产' },
  { id: 'queue', label: '📋 研究队列' },
  { id: 'advance', label: '🚀 时代跃迁' },
];

export default function App() {
  const [tab, setTab] = useState<TabId>('tech');

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-200">
      {/* 火种仪表盘 —— 本作最醒目的常驻元素 */}
      <FireDashboard />

      {/* 卡点提示（无卡点时不渲染） */}
      <HintBar />

      {/* Tab 导航 */}
      <nav className="flex gap-1 px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded text-sm transition-colors ${
              tab === t.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* 主内容区 */}
      <main className="flex-1 overflow-y-auto p-4">
        {tab === 'tech' && <TechTree />}
        {tab === 'production' && (
          <div className="space-y-6 max-w-4xl">
            <ResourcePanel />
            <JobPanel />
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
