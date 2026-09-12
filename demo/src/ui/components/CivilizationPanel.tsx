// 文明页（独立 Tab）· 容器组件
//
// 职责：把与"文明进程"相关的界面聚合成一屏，并提供两种浏览视角。
//   1. 顶栏：进度概览（已学 / 总数）+ 经验存量与产出 + 视图切换
//   2. 跃迁面板：按 reveal 规则渐进出现（放在最上方）
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
import { techsUpToEra } from '../../data/techs';
import { formatNumber, formatRate } from '../../core/format';
import { researchCurrencyName } from '../../data/resources';

import { Icon } from './Icon';
import { TechGrid } from './TechGrid';
import { AdvancePanel } from './AdvancePanel';

export function CivilizationPanel() {
  const s = useStore();
  const view = toEngineState(s);

  // 已学 / 总数按**当前及以前所有时代**统计（techsUpToEra）。
  // 跃迁原则：新时代是叠加开放，不是换版本——E1 的知识积累是 E2 进度的一部分。
  // 进 E2 时读数从「12 / 20」变为「12 / 50」而不是归零重计；
  // 与 TechGrid 已学区的口径保持一致。
  const eraTechs = techsUpToEra(s.era);
  const researched = eraTechs.filter(t => s.techs[t.id]).length;
  const total = eraTechs.length;
  const expOutput = calcExperienceOutput(view);
  const knowledgeHint = s.era === 'E3' && expOutput <= 0
    ? s.techs.cuneiform
      ? '知识暂无产出：请在“工作”中分配书吏。'
      : '知识暂无产出：先研究“楔形文字”，再分配书吏。'
    : null;

  // 渐进解锁：条件未达成时整块面板不渲染（避免开局信息过载）
  const showAdvance = isModuleUnlocked('advance', view);

  const progress = total > 0 ? Math.min(1, researched / total) : 0;

  return (
    <div className="mx-auto min-w-0 max-w-[76rem] space-y-5 xl:space-y-6">
      {/* ── 顶栏：左侧进度 / 中间经验 / 右侧视图切换（无边框，仅极淡底色） ── */}
      <header className="space-y-2 border-b border-gray-800 px-4 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {/* 左：已学科技数（数字等宽对齐） */}
          <div className="text-xs font-mono tabular-nums text-gray-400">
            已学 <span className="text-sm font-semibold text-gray-100">{researched}</span>
            <span className="text-gray-600"> / {total}</span>
          </div>

          {/* 中：经验存量 + 每秒产出（数字等宽对齐） */}
          <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-gray-400">
            <span className="inline-flex items-center gap-1">
              {researchCurrencyName(s.era)}{' '}
              <span className="text-sm font-semibold text-gray-100">
                {formatNumber(view.experience, 0)}
              </span>
              <Icon emoji="💡" className="text-[10px]" />
            </span>
            {/* 产出速率 > 0 时给一点点颜色（关键状态），否则纯灰 */}
            <span
              title={researchCurrencyName(s.era) + '产出速率'}
              className={expOutput > 0 ? 'text-ok' : 'text-gray-600'}
            >
              {formatRate(expOutput)}/秒
            </span>
          </div>
        </div>

        {knowledgeHint && (
          <div className="border-l-2 border-warn/70 pl-2 text-xs text-warn">
            {knowledgeHint}
          </div>
        )}

        {/* 细进度条：把"已学 / 总数"视觉化。
            这是"文明推进了多少"的度量，正是余烬橙该出现的地方（强调色，非中性灰）。 */}
        <div className="h-0.5 overflow-hidden rounded-full bg-gray-800">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </header>

      {/* ── 跃迁面板：渐进解锁，收窄到与其它 Tab 一致的阅读宽度 ── */}
      {showAdvance && (
        <div className="mx-auto max-w-4xl space-y-6">
          <AdvancePanel />
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
