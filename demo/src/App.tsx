// 根组件：整合所有面板，Tabs 布局
import { useState } from 'react';
import Header from './ui/components/Header';
import ResourcePanel from './ui/components/ResourcePanel';
import JobPanel from './ui/components/JobPanel';
import { TechPanel } from './ui/components/TechPanel';
import { GovernmentPanel } from './ui/components/GovernmentPanel';
import { PrestigePanel } from './ui/components/PrestigePanel';
import { MessageLog } from './ui/components/MessageLog';

type TabId = 'resource' | 'job' | 'tech' | 'gov' | 'prestige';

const TABS: { id: TabId; label: string }[] = [
  { id: 'resource', label: '📦 资源' },
  { id: 'job', label: '👥 岗位' },
  { id: 'tech', label: '🔬 科技' },
  { id: 'gov', label: '🏛️ 政府' },
  { id: 'prestige', label: '🌀 重置' },
];

export default function App() {
  const [tab, setTab] = useState<TabId>('resource');

  return (
    <div className="h-screen flex flex-col">
      <Header />

      {/* Tab 导航 */}
      <nav className="flex gap-1 px-4 py-2 bg-gray-800 border-b border-gray-700">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded text-sm ${
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
        {tab === 'resource' && <ResourcePanel />}
        {tab === 'job' && <JobPanel />}
        {tab === 'tech' && <TechPanel />}
        {tab === 'gov' && <GovernmentPanel />}
        {tab === 'prestige' && <PrestigePanel />}
      </main>

      <MessageLog />
    </div>
  );
}
