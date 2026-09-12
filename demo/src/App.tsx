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
import { RecordPanel } from './ui/components/RecordPanel';
import { TradePanel } from './ui/components/TradePanel';
import { EmpirePanel } from './ui/components/EmpirePanel';
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
        {/* 顶部一行：时代标识（固定宽度）｜资源条（占剩余空间）。
            时代标识**参与布局**而不是绝对悬浮 —— 否则资源一多、横向滚动时，
            内容会从它下面滑过（也就是"时代显示遮挡资源"这个 bug 的根因）。 */}
        <div className="flex items-stretch">
          <div
            className="flex w-20 shrink-0 items-center justify-center border-b border-gray-800 bg-gray-900/40 font-display text-sm text-accent"
            aria-label={ERAS[s.era].name}
          >
            {/* 时代指示器 —— 全屏最有身份感的元素：宋体展示字 + 余烬橙强调。
                这是本页"当前焦点"的载体，也是强调色唯一出现处之一。 */}
            {ERAS[s.era].name}
          </div>
          {/* min-w-0 必须给：flex 子项默认 min-width:auto，不给的话
              资源条的 overflow-x-auto 会被撑破、永远不滚动 */}
          <div className="min-w-0 flex-1">
            <TopBar />
          </div>
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

      {/* ②″ 记录容量面板 —— 城邦时代（研究「楔形文字」后）的常驻核心元素。
          组件内部按 recordingEnabled 兜底，未开启时返回 null。 */}
      <RecordPanel />

      {/* ②″′ 贸易面板 —— 城邦时代（研究「商队组织」后）的常驻核心元素。
          组件内部按 caravan_org 科技兜底，未开启时返回 null。 */}
      <TradePanel />

      {/* ②⁗ 帝国面板 —— 帝国时代的常驻核心元素。
          组件内部按 era === 'E4' 兜底，其它时代返回 null。 */}
      <EmpirePanel />

      {/* ③ 卡点提示（无卡点时不渲染） */}
      <HintBar />

      {/* ④ 模块 Tab —— 极简处理：纯文字 + 一条余烬色下划线。
          不再给 Tab 套底色盒子（那是"面板套面板"的噪音来源之一），
          分层只靠 nav 底部那条发丝线 + 活动态的下划线。 */}
      <nav className="panel-in-2 flex shrink-0 gap-6 border-b border-gray-800 px-4">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-1 py-3 text-sm transition-colors ${
              // 活动态：余烬色下划线（这是强调色"当前焦点"语义的正确落点）
              // 非活动态：透明下划线占位，避免切换时高度跳动
              tab === t
                ? 'border-accent font-medium text-gray-100'
                : 'border-transparent text-gray-500 hover:text-gray-200'
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
