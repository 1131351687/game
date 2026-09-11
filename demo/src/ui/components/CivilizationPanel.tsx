// 文明页（独立 Tab）· 容器组件
//
// 职责：把与"文明进程"相关的界面聚合成一屏，并提供两种浏览视角。
//   1. 顶栏：进度概览（已学 / 总数）+ 经验存量与产出 + 视图切换
//   2. 跃迁 / 队列面板：按 reveal 规则渐进出现（放在最上方）
//   3. 视图区：分类视图 / 树状图视图 二选一
//
// 布局约定（配合 App.tsx 的 Tab 结构）：
//   · 外层已由 App.tsx 提供 `mx-auto max-w-4xl`，本组件不再套外层限宽容器
//   · 但树状图需要横向空间，所以**视图区不限宽**，只有跃迁/队列两块收窄到 max-w-4xl
//   · MessageLog 是 `fixed bottom-0`（约 160px），视图区底部 pb-40 防止最后一行被遮挡
//
// 视觉约定（v3 简约化）：
//   · 顶栏去掉边框与实心卡片感，只用一层极淡背景 + 留白
//   · 视图切换做成 segmented control（一个内凹容器 + 两个按钮，选中项 bg-gray-700），不用亮蓝
//   · 所有 emoji 经 <Icon> 渲染（纯文字模式），间距用 gap 建立，不依赖图标宽度

import { useStore, toEngineState } from '../../state/store';
import { calcExperienceOutput } from '../../game/engine';
import { isModuleUnlocked } from '../../game/reveal';
import { techsOfEra } from '../../data/techs';
import { formatNumber, formatRate } from '../../core/format';

import { Icon } from './Icon';
import { TechGrid } from './TechGrid';
import { QueuePanel } from './QueuePanel';
import { AdvancePanel } from './AdvancePanel';

export function CivilizationPanel() {
  const s = useStore();
  const view = toEngineState(s);

  // 已学 / 总数都按**当前时代**统计。
  // 若沿用全局 TECHS.length，加入 E2 的 30 项科技后，
  // 远古时代的顶栏会从「已学 0 / 20」变成「已学 0 / 50」——
  // 玩家的文明进度读数被稀释（E1 的 20 项占不到一半），远古时代的界面也被无端改动。
  const eraTechs = techsOfEra(s.era);
  const researched = eraTechs.filter(t => s.techs[t.id]).length;
  const total = eraTechs.length;
  const expOutput = calcExperienceOutput(view);

  // 渐进解锁：条件未达成时整块面板不渲染（避免开局信息过载）
  const showAdvance = isModuleUnlocked('advance', view);
  const showQueue = isModuleUnlocked('queue', view);

  const progress = total > 0 ? Math.min(1, researched / total) : 0;

  return (
    <div className="space-y-4">
      {/* ── 顶栏：左侧进度 / 中间经验 / 右侧视图切换（无边框，仅极淡底色） ── */}
      <header className="rounded-md bg-gray-800/40 px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {/* 左：已学科技数（数字等宽对齐） */}
          <div className="text-xs font-mono tabular-nums text-gray-500">
            已学 <span className="text-sm font-semibold text-gray-100">{researched}</span>
            <span className="text-gray-600"> / {total}</span>
          </div>

          {/* 中：经验存量 + 每秒产出（数字等宽对齐） */}
          <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-gray-500">
            <span className="inline-flex items-center gap-1">
              经验{' '}
              <span className="text-sm font-semibold text-gray-100">
                {formatNumber(view.experience, 0)}
              </span>
              <Icon emoji="💡" className="text-[10px]" />
            </span>
            {/* 产出速率 > 0 时给一点点颜色（关键状态），否则纯灰 */}
            <span
              title="经验产出速率"
              className={expOutput > 0 ? 'text-emerald-500/90' : 'text-gray-600'}
            >
              {formatRate(expOutput)}/秒
            </span>
          </div>
        </div>

        {/* 细进度条：把"已学 / 总数"视觉化。
            这是"文明推进了多少"的度量，正是余烬橙该出现的地方（强调色，非中性灰）。 */}
        <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-gray-800">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </header>

      {/* ── 跃迁 + 队列：渐进解锁，收窄到与其它 Tab 一致的阅读宽度 ── */}
      {(showAdvance || showQueue) && (
        <div className="mx-auto max-w-4xl space-y-4">
          {/* 跃迁面板在上（时代进程比排队更重要） */}
          {showAdvance && <AdvancePanel />}
          {showQueue && <QueuePanel />}
        </div>
      )}

      {/* ── 视图区：紧凑方块网格（替代原来的分类 / 树状图长文案） ── */}
      <div className="pb-40">
        <TechGrid />
      </div>
    </div>
  );
}

// App.tsx 目前以具名导入引用本组件，这里保留默认导出以兼容两种写法
export default CivilizationPanel;
