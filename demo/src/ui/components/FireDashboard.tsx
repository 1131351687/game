// 火种仪表盘 —— 本作最主要的视觉元素
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
 * 三档（含熄灭）配色，用于 SVG 环形进度条描边。
 * 文案色直接用 FIRE_TIER_INFO.color（Tailwind 会在 constants.ts 中扫描到这些类名）。
 */
const TIER_RING: Record<FireTier, string> = {
  out: '#6b7280', // 熄灭 · 灰
  weak: '#fb923c', // 微弱 · 橙
  stable: '#fdba74', // 稳定 · 橙黄
  blazing: '#fde047', // 旺盛 · 金
};

/** 低于此值进入危险区：进度条变红闪烁 */
const DANGER_THRESHOLD = 20;

const RING_R = 66;
const RING_C = 2 * Math.PI * RING_R;

export function FireDashboard() {
  const state = useStore();
  const view = toEngineState(state);
  const { addFuel, toggleAutoMaintain } = state;

  // 是否已研究「掌握火」—— 未研究时火种系统整体未开启
  const fireEnabled = aggregateEffects(view).fireEnabled;

  const fire = state.fire;
  const max = getFireMax(view);
  const decay = getFireDecay(view);
  const factor = getFireFactor(view);
  const tierInfo = getFireTierInfo(view);

  const ratio = max > 0 ? Math.min(1, Math.max(0, fire / max)) : 0;
  const dash = RING_C * ratio;
  const danger = fireEnabled && fire < DANGER_THRESHOLD;
  const stroke = fireEnabled ? TIER_RING[tierInfo.tier] : TIER_RING.out;

  // 以当前衰减速率还能烧多久 —— 制造压力感
  const burnOut = decay > 0 ? fire / decay : Number.POSITIVE_INFINITY;

  return (
    <section className="rounded-xl border border-gray-700 bg-gradient-to-b from-gray-800 to-gray-900 p-4 shadow-lg">
      <header className="flex items-baseline justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">🔥 火种</h2>
        <span className="text-xs text-gray-500">
          上限 {formatNumber(max, 0)} · 每 1 🪵 = +{FIRE.PER_WOOD} 火种
        </span>
      </header>

      {!fireEnabled ? (
        // ── 火种尚未开启 ──
        <div className="mt-3 rounded-lg border border-dashed border-gray-700 bg-gray-900/60 p-6 text-center">
          <div className="text-4xl">🪨</div>
          <p className="mt-2 text-lg font-semibold text-gray-400">尚未掌握火</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            研究科技「掌握火」以点燃第一堆火。
            <br />
            点燃之后火会持续衰减，必须不断投入木材维持 —— 火是人口增长的前提。
          </p>
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-4">
            {/* ── 环形进度 + 大字火种值 ── */}
            <div className="relative shrink-0">
              <svg
                width={150}
                height={150}
                viewBox="0 0 150 150"
                className={danger ? 'animate-pulse' : undefined}
                role="img"
                aria-label={`火种 ${Math.floor(fire)} / ${formatNumber(max, 0)}`}
              >
                {/* 轨道 */}
                <circle cx={75} cy={75} r={RING_R} fill="none" stroke="#1f2937" strokeWidth={14} />
                {/* 进度（从 12 点方向顺时针） */}
                <circle
                  cx={75}
                  cy={75}
                  r={RING_R}
                  fill="none"
                  stroke={danger ? '#ef4444' : stroke}
                  strokeWidth={14}
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${RING_C - dash}`}
                  transform="rotate(-90 75 75)"
                  style={{ transition: 'stroke-dasharray 200ms linear' }}
                />
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className={`text-5xl font-black leading-none tabular-nums ${tierInfo.color}`}
                >
                  {Math.floor(fire)}
                </span>
                <span className="mt-1 text-[10px] text-gray-500">/ {formatNumber(max, 0)}</span>
              </div>
            </div>

            {/* ── 档位 / 因子 / 衰减 ── */}
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className={`text-lg font-bold ${tierInfo.color}`}>{tierInfo.name}</span>
                <span className="rounded bg-gray-900 px-2 py-0.5 text-xs text-gray-300">
                  火源因子 ×{factor.toFixed(2)}
                </span>
              </div>

              {/* 衰减速率：让玩家感到压力 */}
              <div className="rounded-lg bg-gray-900/70 px-2.5 py-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-gray-400">衰减</span>
                  <span className="text-sm font-semibold tabular-nums text-red-400">
                    -{decay.toFixed(2)}/秒
                  </span>
                </div>
                <div className="mt-0.5 flex items-baseline justify-between">
                  <span className="text-xs text-gray-500">预计熄灭</span>
                  <span className="text-xs tabular-nums text-gray-400">{formatTime(burnOut)}后</span>
                </div>
              </div>

              <div className="text-[11px] leading-snug text-gray-500">
                火越旺，人口增长越快、食物加成越高；熄灭则人口持续流失。
              </div>
            </div>
          </div>

          {/* ── 线性进度条（危险时红色闪烁）── */}
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-900">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                danger ? 'animate-pulse bg-red-500' : ''
              }`}
              style={{ width: `${ratio * 100}%`, backgroundColor: danger ? undefined : stroke }}
            />
          </div>
          {danger && (
            <p className="mt-1 animate-pulse text-xs font-semibold text-red-400">
              ⚠️ 火种告急 —— 立即投入木材，否则火将熄灭
            </p>
          )}

          {/* ── 操作区：手动投料 ── */}
          <div className="mt-3">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs text-gray-400">投入木材</span>
              <span className="text-xs tabular-nums text-gray-500">
                库存 🪵 {formatNumber(state.wood, 0)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {FIRE.WOOD_INPUT_STEPS.map(step => {
                const disabled = state.wood < step;
                return (
                  <button
                    key={step}
                    type="button"
                    disabled={disabled}
                    onClick={() => addFuel(step)}
                    title={`消耗 ${step} 木材，火种 +${step * FIRE.PER_WOOD}`}
                    className={`rounded-md px-3 py-1.5 text-sm font-semibold tabular-nums transition-colors ${
                      disabled
                        ? 'cursor-not-allowed bg-gray-800 text-gray-600'
                        : 'bg-orange-600 text-white hover:bg-orange-500 active:bg-orange-700'
                    }`}
                  >
                    +{step} 🪵
                  </button>
                );
              })}
            </div>
            {state.wood < FIRE.WOOD_INPUT_STEPS[0] && (
              <p className="mt-1 text-[11px] text-red-400">木材不足，派更多人去伐木</p>
            )}
          </div>

          {/* ── 操作区：自动维持 ── */}
          <div className="mt-3 flex items-center justify-between rounded-lg bg-gray-900/70 px-2.5 py-2">
            <div className="min-w-0">
              <div className="text-sm text-gray-300">
                自动维持
                <span
                  className={`ml-2 text-xs font-semibold ${
                    state.autoMaintainFire ? 'text-green-400' : 'text-gray-500'
                  }`}
                >
                  {state.autoMaintainFire ? '开' : '关'}
                </span>
              </div>
              <div className="text-[11px] leading-snug text-gray-500">
                火种低于 {FIRE.AUTO_MAINTAIN_THRESHOLD} 时自动投入木材
              </div>
            </div>
            <button
              type="button"
              onClick={toggleAutoMaintain}
              aria-pressed={state.autoMaintainFire}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                state.autoMaintainFire
                  ? 'bg-green-600 text-white hover:bg-green-500'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {state.autoMaintainFire ? '关闭' : '开启'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

// App.tsx 目前以默认导入引用本组件，这里保留默认导出以兼容两种写法
export default FireDashboard;
