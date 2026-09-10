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

import { useState } from 'react';

import { useStore, toEngineState } from '../../state/store';
import { countResearched, calcExperienceOutput } from '../../game/engine';
import { isModuleUnlocked } from '../../game/reveal';
import { TECHS } from '../../data/techs';
import { formatNumber, formatRate } from '../../core/format';

import { TechCategories } from './TechCategories';
import { TechTree } from './TechTree';
import { QueuePanel } from './QueuePanel';
import { AdvancePanel } from './AdvancePanel';

export function CivilizationPanel() {
  const s = useStore();
  const view = toEngineState(s);

  // 视图切换属于纯展示状态，不进 store（刷新/存档不需要记住）
  const [mode, setMode] = useState<'categories' | 'tree'>('categories');

  const researched = countResearched(view);
  const total = TECHS.length;
  const expOutput = calcExperienceOutput(view);

  // 渐进解锁：条件未达成时整块面板不渲染（避免开局信息过载）
  const showAdvance = isModuleUnlocked('advance', view);
  const showQueue = isModuleUnlocked('queue', view);

  const progress = total > 0 ? Math.min(1, researched / total) : 0;

  return (
    <div className="space-y-4">
      {/* ── 顶栏：左侧进度 / 中间经验 / 右侧视图切换 ── */}
      <header className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {/* 左：已学科技数 */}
          <div className="text-xs tabular-nums text-gray-400">
            已学{' '}
            <span className="text-sm font-semibold text-gray-100">{researched}</span>
            <span className="text-gray-500"> / {total}</span>
          </div>

          {/* 中：经验存量 + 每秒产出 */}
          <div className="flex items-center gap-2 text-xs tabular-nums text-gray-400">
            <span>
              经验{' '}
              <span className="text-sm font-semibold text-amber-300">
                {formatNumber(view.experience, 0)}
              </span>{' '}
              💡
            </span>
            <span
              title="经验产出速率"
              className={expOutput > 0 ? 'text-emerald-400' : 'text-gray-500'}
            >
              {formatRate(expOutput)}/秒
            </span>
          </div>

          {/* 右：视图切换（当前视图高亮） */}
          <div className="flex items-center gap-1" role="group" aria-label="视图切换">
            <button
              type="button"
              onClick={() => setMode('categories')}
              aria-pressed={mode === 'categories'}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                mode === 'categories'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              分类
            </button>
            <button
              type="button"
              onClick={() => setMode('tree')}
              aria-pressed={mode === 'tree'}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                mode === 'tree'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              树状图
            </button>
          </div>
        </div>

        {/* 细进度条：把"已学 / 总数"视觉化 */}
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-gray-900">
          <div
            className="h-full rounded-full bg-blue-600 transition-[width] duration-300"
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

      {/* ── 视图区：不限宽，树状图需要横向空间 ── */}
      <div className="pb-40">
        {mode === 'categories' ? <TechCategories /> : <TechTree />}
      </div>
    </div>
  );
}

// App.tsx 目前以具名导入引用本组件，这里保留默认导出以兼容两种写法
export default CivilizationPanel;
