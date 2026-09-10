// 火种仪表盘 —— 页面第 ② 层，位于 TopBar 之下、Tab 之上
//
// 设计变更（布局重构后）：本组件原先是「顶部大号常驻仪表盘」（SVG 环形进度 + text-5xl 大字），
// 但下方还有 Tab 栏与内容区，再占一大块垂直空间就会把内容区压扁。
// 现改为**紧凑横向条状布局**（高度 ≤ 64px，py-2）：🔥 火种 [线性进度条] 72/100 稳定 ×1.0 −2.0/秒 [投料] [自动维持]
//
// 火种会持续衰减，玩家必须投入木材维持；火源因子同时影响人口增长与食物加成。
//
// 视觉简约化：去掉卡片外框与深色底，进度条变细（h-2）并直接融入页面；
// 只有「档位配色」「危险红闪」「自动维持已开启」这三类关键状态保留颜色，
// 按钮改为无边框、仅 hover 时显色。所有 emoji 走 <Icon>，兼容纯文字模式。

import { useStore, toEngineState } from '../../state/store';
import {
  aggregateEffects,
  getFireDecay,
  getFireFactor,
  getFireMax,
  getFireTierInfo,
} from '../../game/engine';
import { FIRE, type FireTier } from '../../data/constants';
import { formatNumber, formatTime } from '../../core/format';
import { Icon } from './Icon';

/**
 * 三档（含熄灭）进度条填充色。
 * 文案色直接用 getFireTierInfo(view).color（Tailwind 在 constants.ts 中能扫描到这些类名），
 * 进度条是 backgroundColor，需要一个对应的十六进制值，故在此映射。
 */
const TIER_BAR: Record<FireTier, string> = {
  out: '#6b7280', // 熄灭 · 灰
  weak: '#fb923c', // 微弱 · 橙
  stable: '#fdba74', // 稳定 · 橙黄
  blazing: '#fde047', // 旺盛 · 金
};

/** 低于此值进入危险区：进度条与数字变红闪烁 */
const DANGER_THRESHOLD = 20;

/** 投料按钮：默认无边框的轻量文字按钮，仅 hover 时透出暖色 */
const FUEL_BTN =
  'rounded-md px-2 py-1 font-mono text-xs font-semibold tabular-nums transition-colors';

export function FireDashboard() {
  const state = useStore();
  const view = toEngineState(state);
  const { addFuel, toggleAutoMaintain } = state;

  // 是否已研究「掌握火」—— 未研究时火种系统整体未开启。
  // 兜底判断：App.tsx 已用 isModuleUnlocked('fire', view) 控制外层渲染，
  // 而该函数内部正是 aggregateEffects(view).fireEnabled，二者取值完全一致，
  // 因此这里返回 null 不会与之冲突，也就不存在重复判断导致的闪烁。
  const fireEnabled = aggregateEffects(view).fireEnabled;
  if (!fireEnabled) return null;

  // ── 定居时代起：火源退出主流程 ──
  //
  // 设计文档 §13「火源区（降级）」：火源从 E1 的顶部大号仪表盘**移入「基础设施」折叠区**，
  // 标签改为「火源 · 人口舒适度基础」，语义是「×1.0 恒定，无需维护」。
  // 本组件不渲染任何内容即等价于"已折叠"。
  //
  // 为什么必须撤掉而不是照常显示：E2 的 tickFire 会冻结火值（维护取消），
  // 若继续显示，界面会挂着「−1.00/秒」「N 秒后熄灭」的假倒计时，
  // 以及一个点了也没用的「自动维持」开关 —— 数值与视图必须同源。
  if (state.era !== 'E1') return null;

  const fire = state.fire;
  const max = getFireMax(view);
  const decay = getFireDecay(view);
  const factor = getFireFactor(view);
  const tierInfo = getFireTierInfo(view);

  const ratio = max > 0 ? Math.min(1, Math.max(0, fire / max)) : 0;
  const danger = fire < DANGER_THRESHOLD;
  const barColor = danger ? '#ef4444' : TIER_BAR[tierInfo.tier];

  // 以当前衰减速率还能烧多久 —— 制造压力感
  const burnOut = decay > 0 ? fire / decay : Number.POSITIVE_INFINITY;

  return (
    <section className="flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto border-b border-gray-800 px-4 py-2 text-sm leading-tight">
      {/* ── 标题 ── */}
      <span className="flex shrink-0 items-center gap-1.5 text-gray-500">
        <Icon emoji="🔥" className="text-sm" />
        <span>火种</span>
      </span>

      {/* ── 线性进度条（危险时红色闪烁）—— 细条、无外框，融入页面 ── */}
      <div
        className="relative h-2 min-w-[7rem] flex-1 overflow-hidden rounded-md bg-gray-800/60"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.floor(fire)}
        aria-label={`火种 ${Math.floor(fire)} / ${formatNumber(max, 0)}`}
      >
        <div
          className={`h-full rounded-md transition-all duration-300 ${danger ? 'animate-pulse' : ''}`}
          style={{ width: `${ratio * 100}%`, backgroundColor: barColor }}
        />
      </div>

      {/* ── 数值：等宽 + 右对齐，位数变化不抖动；危险时变红闪烁 ── */}
      <span
        className={`shrink-0 min-w-[5rem] text-right font-mono font-semibold tabular-nums ${
          danger ? 'animate-pulse text-red-400' : tierInfo.color
        }`}
      >
        {Math.floor(fire)}
        <span className="font-normal text-gray-600"> / {formatNumber(max, 0)}</span>
      </span>

      {/* ── 档位 + 火源因子 ── */}
      <span
        className={`shrink-0 whitespace-nowrap text-xs ${
          danger ? 'text-red-400' : tierInfo.color
        }`}
      >
        {tierInfo.name}
      </span>
      <span className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-gray-500">
        ×{factor.toFixed(2)}
      </span>

      {/* ── 衰减速率 / 预计熄灭时间 ── */}
      <span className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-red-400/80">
        −{decay.toFixed(2)}/秒
      </span>
      <span className="shrink-0 whitespace-nowrap text-xs text-gray-600">
        {formatTime(burnOut)}后熄灭
      </span>

      {/* ── 当前木材存量（投料按钮旁，不足时标红）── */}
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-gray-500">
        <Icon emoji="🪵" className="text-xs" />
        <span
          className={`font-mono tabular-nums ${
            state.wood < FIRE.WOOD_INPUT_STEPS[0] ? 'text-red-400' : ''
          }`}
        >
          {formatNumber(state.wood, 0)}
        </span>
      </span>

      {/* ── 操作：手动投料（木材不足时禁用）── */}
      <div className="flex shrink-0 items-center gap-1">
        {FIRE.WOOD_INPUT_STEPS.map(step => {
          const disabled = state.wood < step;
          return (
            <button
              key={step}
              type="button"
              disabled={disabled}
              onClick={() => addFuel(step)}
              title={
                disabled
                  ? `木材不足（需要 ${step}，现有 ${Math.floor(state.wood)}）`
                  : `消耗 ${step} 木材，火种 +${step * FIRE.PER_WOOD}`
              }
              className={`${FUEL_BTN} ${
                disabled
                  ? 'cursor-not-allowed text-gray-700'
                  : 'text-gray-400 hover:bg-orange-500/15 hover:text-orange-300 active:bg-orange-500/25'
              }`}
            >
              +{step}
            </button>
          );
        })}
      </div>

      {/* ── 操作：自动维持开关（开启属于「已达成」状态，保留绿色）── */}
      <button
        type="button"
        onClick={toggleAutoMaintain}
        aria-pressed={state.autoMaintainFire}
        title={`低于 ${FIRE.AUTO_MAINTAIN_THRESHOLD} 时自动投入木材`}
        className={`shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-xs transition-colors ${
          state.autoMaintainFire
            ? 'text-emerald-400 hover:bg-emerald-500/10'
            : 'text-gray-600 hover:bg-gray-800/60 hover:text-gray-400'
        }`}
      >
        自动维持 {state.autoMaintainFire ? '✓' : '✗'}
      </button>
    </section>
  );
}

// App.tsx 以具名导入引用本组件；保留默认导出以兼容两种写法
export default FireDashboard;
