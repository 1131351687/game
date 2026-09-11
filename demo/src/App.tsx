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
import { SeasonBar } from './ui/components/SeasonBar';
import { JobPanel } from './ui/components/JobPanel';
import { BuildingPanel } from './ui/components/BuildingPanel';
import { CivilizationPanel } from './ui/components/CivilizationPanel';
import { SettingsMenu } from './ui/components/SettingsMenu';
import { HintBar } from './ui/components/HintBar';
import { MessageLog } from './ui/components/MessageLog';
import { isModuleUnlocked } from './game/reveal';
import { ERAS } from './data/era';

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

  // 根容器去掉不透明底色：页面底色与"余烬光晕 + 颗粒"两层氛围
  // 已挂在 body::before/::after 上，#root 用 z-index:2 盖在其上。
  // 根容器若是不透明底会把氛围层整个盖死，所以只留文字色。
  return (
    <div className="flex h-screen flex-col text-gray-200">
      {/* ① 顶部：资源条 + 右上角设置按钮（错峰入场第一拍） */}
      <div className="panel-in relative shrink-0">
        <TopBar />
        {/* 时代指示器 —— 全屏最有身份感的元素：宋体展示字 + 余烬橙强调。
            这是本页"当前焦点"的载体，也是强调色唯一出现处之一。 */}
        <div className="absolute left-2 top-1/2 -translate-y-1/2 font-display text-sm text-accent">
          {ERAS[s.era].name}
        </div>
        {/* 设置按钮悬浮在资源条右上角，不占用资源条的布局空间 */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <SettingsMenu />
        </div>
      </div>

      {/* ② 火种仪表盘 —— 掌握火之后的常驻核心元素（E2 起转为恒定，由 SeasonBar 接棒） */}
      {fireUnlocked && <FireDashboard />}

      {/* ②′ 季节面板 —— 定居时代（研究「农业」后）的常驻核心元素 */}
      <SeasonBar />

      {/* ③ 卡点提示（无卡点时不渲染） */}
      <HintBar />

      {/* ④ 模块 Tab —— 置于顶部，紧邻资源条（错峰入场第二拍） */}
      <nav className="panel-in-2 flex shrink-0 gap-1 border-b border-gray-700 bg-gray-800 px-4 py-2">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
              // 活动态：用一条余烬色细环标记"当前 Tab"，而非整块橙色
              // （整块蓝/橙都是默认值残留，会破坏"强调色单屏只一处"的纪律）
              tab === t
                ? 'bg-gray-800 text-gray-100 ring-1 ring-accent'
                : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
          >
            {TAB_INFO[t].icon} {TAB_INFO[t].label}
          </button>
        ))}
      </nav>

      {/* ⑤ 内容区（错峰入场第三拍；随 Tab 切换重新挂载会重播，作为反馈可接受） */}
      <main className="panel-in-3 flex-1 overflow-y-auto p-4">
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
