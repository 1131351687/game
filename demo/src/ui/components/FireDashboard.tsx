// 火种仪表盘 —— 页面第 ② 层，位于 TopBar 之下、Tab 之上
//
// 设计变更（布局重构后）：本组件原先是「顶部大号常驻仪表盘」（SVG 环形进度 + text-5xl 大字），
// 但下方还有 Tab 栏与内容区，再占一大块垂直空间就会把内容区压扁。
// 现改为**紧凑横向条状布局**（高度 ≤ 64px，py-2）：🔥 火种 [线性进度条] 72/100 稳定 ×1.0 −2.0/秒 [投料] [自动维持]
//
// 火种会持续衰减，玩家必须投入木材维持；火源因子同时影响人口增长与食物加成。

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
    <section className="flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto border-b border-gray-700 bg-gray-800 px-4 py-2 text-sm leading-tight">
      {/* ── 标题 ── */}
      <span className="flex shrink-0 items-center gap-1 font-bold text-gray-300">
        <span className="text-sm">🔥</span>
        <span>火种</span>
      </span>

      {/* ── 线性进度条（危险时红色闪烁）── */}
      <div
        className="relative h-4 min-w-[7rem] flex-1 overflow-hidden rounded-full bg-gray-900"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.floor(fire)}
        aria-label={`火种 ${Math.floor(fire)} / ${formatNumber(max, 0)}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            danger ? 'animate-pulse' : ''
          }`}
          style={{ width: `${ratio * 100}%`, backgroundColor: barColor }}
        />
      </div>

      {/* ── 数值：等宽 + 右对齐，位数变化不抖动；危险时变红闪烁 ── */}
      <span
        className={`shrink-0 min-w-[5rem] text-right font-mono font-bold tabular-nums ${
          danger ? 'animate-pulse text-red-400' : tierInfo.color
        }`}
      >
        {Math.floor(fire)}
        <span className="font-normal text-gray-500"> / {formatNumber(max, 0)}</span>
      </span>

      {/* ── 档位 + 火源因子 ── */}
      <span
        className={`shrink-0 whitespace-nowrap font-semibold ${
          danger ? 'text-red-400' : tierInfo.color
        }`}
      >
        {tierInfo.name}
      </span>
      <span className="shrink-0 whitespace-nowrap rounded bg-gray-900 px-1.5 py-0.5 text-xs text-gray-300">
        ×{factor.toFixed(2)}
      </span>

      {/* ── 衰减速率 / 预计熄灭时间 ── */}
      <span className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-red-400">
        −{decay.toFixed(2)}/秒
      </span>
      <span className="shrink-0 whitespace-nowrap text-xs text-gray-500">
        {formatTime(burnOut)}后熄灭
      </span>

      {/* ── 操作：手动投料（木材不足时禁用）── */}
      <span className="shrink-0 whitespace-nowrap text-xs text-gray-500">
        🪵
        <span className={`ml-1 font-mono tabular-nums ${state.wood < FIRE.WOOD_INPUT_STEPS[0] ? 'text-red-400' : ''}`}>
          {formatNumber(state.wood, 0)}
        </span>
      </span>
      <div className="flex shrink-0 items-center gap-1.5">
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
              className={`rounded px-2 py-1 font-mono text-xs font-semibold tabular-nums transition-colors ${
                disabled
                  ? 'cursor-not-allowed bg-gray-800 text-gray-600'
                  : 'bg-orange-600 text-white hover:bg-orange-500 active:bg-orange-700'
              }`}
            >
              +{step}
            </button>
          );
        })}
      </div>

      {/* ── 操作：自动维持开关 ── */}
      <button
        type="button"
        onClick={toggleAutoMaintain}
        aria-pressed={state.autoMaintainFire}
        title={`低于 ${FIRE.AUTO_MAINTAIN_THRESHOLD} 时自动投入木材`}
        className={`shrink-0 whitespace-nowrap rounded px-2 py-1 text-xs font-semibold transition-colors ${
          state.autoMaintainFire
            ? 'bg-green-600 text-white hover:bg-green-500'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        }`}
      >
        自动维持 {state.autoMaintainFire ? '✓' : '✗'}
      </button>
    </section>
  );
}

// App.tsx 以具名导入引用本组件；保留默认导出以兼容两种写法
export default FireDashboard;
