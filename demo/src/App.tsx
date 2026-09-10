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
import { TechTree } from './ui/components/TechTree';
import { JobPanel } from './ui/components/JobPanel';
import { BuildingPanel } from './ui/components/BuildingPanel';
import { QueuePanel } from './ui/components/QueuePanel';
import { HintBar } from './ui/components/HintBar';
import { AdvancePanel } from './ui/components/AdvancePanel';
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

  // 渐进解锁：建筑模块在任一建筑可见后才出现；队列在研究 2 项后并入「文明」
  const showBuildings = isModuleUnlocked('buildings', view);
  const showQueue = isModuleUnlocked('queue', view);
  const showAdvance = isModuleUnlocked('advance', view);

  const tabs: TabId[] = ['work', 'civilization'];
  if (showBuildings) tabs.splice(1, 0, 'buildings');

  return (
    <div className="flex h-screen flex-col bg-gray-900 text-gray-200">
      {/* ① 顶部资源条 —— 常驻最上方 */}
      <TopBar />

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

        {tab === 'civilization' && (
          <div className="space-y-5">
            {/* 时代跃迁：达成条件后才出现 */}
            {showAdvance && (
              <div className="mx-auto max-w-4xl">
                <AdvancePanel />
              </div>
            )}

            {/* 研究队列：研究 2 项后出现 */}
            {showQueue && (
              <div className="mx-auto max-w-4xl">
                <QueuePanel />
              </div>
            )}

            {/* 科技树 —— 文明页的主体 */}
            <TechTree />
          </div>
        )}
      </main>

      {/* ⑥ 消息日志 */}
      <MessageLog />
    </div>
  );
}
