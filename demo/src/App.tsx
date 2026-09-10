// 根组件 · E1 远古时代
//
// 布局（自上而下）：
//   顶部资源条（常驻）→ 火种仪表盘（掌握火后）→ 卡点提示 → 模块 Tab → 内容 → 消息日志
//
// 模块分类：工作（岗位） / 建筑 / 文明（科技树 + 队列 + 跃迁）
// 渐进解锁：未解锁的模块不显示，开局只有「工作」与「文明」两个 Tab。

import { useState } from 'react';
import { useStore, toEngineState } from './state/store';
import { TopBar } from './ui/components/TopBar';
import { FireDashboard } from './ui/components/FireDashboard';
import { JobPanel } from './ui/components/JobPanel';
import { BuildingPanel } from './ui/components/BuildingPanel';
import { CivilizationPanel } from './ui/components/CivilizationPanel';
import { SettingsMenu } from './ui/components/SettingsMenu';
import { HintBar } from './ui/components/HintBar';
import { MessageLog } from './ui/components/MessageLog';
import { isModuleUnlocked } from './game/reveal';

type TabId = 'work' | 'civilization' | 'buildings';

const TAB_INFO: Record<TabId, { label: string; icon: string }> = {
  work: { label: '工作', icon: '👥' },
  buildings: { label: '建筑', icon: '🏕️' },
  civilization: { label: '文明', icon: '🔬' },
};

export default function App() {
  const s = useStore();
  const view = toEngineState(s);
  const [tab, setTab] = useState<TabId>('civilization');

  const fireUnlocked = isModuleUnlocked('fire', view);

  // 渐进解锁：建筑模块在任一建筑可见后才出现
  // （队列与跃迁由 CivilizationPanel 内部按 reveal 规则处理）
  const showBuildings = isModuleUnlocked('buildings', view);

  const tabs: TabId[] = ['work', 'civilization'];
  if (showBuildings) tabs.splice(1, 0, 'buildings');

  return (
    <div className="flex h-screen flex-col bg-gray-900 text-gray-200">
      {/* ① 顶部：资源条 + 右上角设置按钮 */}
      <div className="relative shrink-0">
        <TopBar />
        {/* 设置按钮悬浮在资源条右上角，不占用资源条的布局空间 */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <SettingsMenu />
        </div>
      </div>

      {/* ② 火种仪表盘 —— 掌握火之后的常驻核心元素 */}
      {fireUnlocked && <FireDashboard />}

      {/* ③ 卡点提示（无卡点时不渲染） */}
      <HintBar />

      {/* ④ 模块 Tab —— 置于顶部，紧邻资源条 */}
      <nav className="flex shrink-0 gap-1 border-b border-gray-700 bg-gray-800 px-4 py-2">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-4 py-1.5 text-sm transition-colors ${
              tab === t ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {TAB_INFO[t].icon} {TAB_INFO[t].label}
          </button>
        ))}
      </nav>

      {/* ⑤ 内容区 */}
      <main className="flex-1 overflow-y-auto p-4">
        {tab === 'work' && (
          <div className="mx-auto max-w-4xl">
            <JobPanel />
          </div>
        )}

        {tab === 'buildings' && (
          <div className="mx-auto max-w-4xl">
            <BuildingPanel />
          </div>
        )}

        {tab === 'civilization' && <CivilizationPanel />}
      </main>

      {/* ⑥ 消息日志 */}
      <MessageLog />
    </div>
  );
}
