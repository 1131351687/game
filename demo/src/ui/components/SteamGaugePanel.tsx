// 蒸汽压力表面板（E6 机器时代）
//
// 本面板是 E6 的**视觉主角**，地位等同 E1 的火种仪表盘。
//
// 设计意图（E6-devplan §3.5）：
//   压力表必须让玩家"看得见锅炉在烧"，且必须把
//   「当前档位」与「当前世代所需档位」画在同一条刻度上。
//   只显示一个压力数字是不够的 —— 玩家需要立刻看出
//   "我卡在 34，世代 IV 要 67，还差一半"，而不是自己去查表。
//
// 因此刻度条上画两个标记：
//   ▸ 当前压力（填充条）
//   ▸ 当前世代的**需求线**（竖线，达标变绿、不达标变红）
// 一旦压力掉到需求线以下，整条刻度变红并出现喘振警告。

import { useStore, toEngineState } from '../../state/store';
import { aggregateEffects } from '../../game/engine';
import {
  getPressureTier,
  getPressureCap,
  getRequiredPressure,
  getSteamTierLabel,
  isPressureSufficient,
  getCoalBurned,
} from '../../game/e6/energy';
import { Icon } from './Icon';

export function SteamGaugePanel({ className }: { className?: string }) {
  const state = useStore();
  const view = toEngineState(state);
  if (state.era !== 'E6') return null;

  const eff = aggregateEffects(view);
  // 注：压力机制**没有科技修正项**（锅炉房数决定上限、司炉工决定升压、
  //     世代科技决定需求线），因此这里不需要 e6fx。
  //     eff 仍要用到：世代/需求线经 isPressureSufficient 与 getRequiredPressure
  //     间接依赖 techs，而 eff 保证与引擎同源。
  void eff;

  const boilers = state.buildings.boiler_house ?? 0;
  // 没有任何锅炉设施时，本机制尚未启动，不渲染以免噪音
  if (boilers === 0) return null;

  const pressure = state.steamPressure ?? 0;
  const cap = getPressureCap(view);
  const tier = getPressureTier(pressure);
  const required = getRequiredPressure(view);
  const ok = isPressureSufficient(view);
  const steamTier = getSteamTierLabel(view);

  const stokers = state.jobs.stoker ?? 0;
  const coalBurned = getCoalBurned(view);
  const burnedRatio = cap > 0 ? Math.min(1, pressure / cap) : 0;
  const requiredRatio = cap > 0 ? Math.min(1, required / cap) : 0;

  // 无锅炉房时压力上限只有基础 100，玩家会觉得"为什么压不上去"
  const boilerNote =
    boilers === 0
      ? '没有锅炉房 —— 压力几乎无法维持，先建一座。'
      : null;

  return (
    <section
      className={
        className
          ? `${className} space-y-2 rounded-md border border-gray-800 bg-gray-900/30 px-3 py-3`
          : 'space-y-2 rounded-md border border-gray-800 bg-gray-900/30 px-3 py-3'
      }
    >
      {/* ── 顶行：档位 + 世代 ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon emoji="🌡️" className="text-sm" />
          <span className="text-sm font-semibold text-gray-200">蒸汽压力</span>
          <span
            className="rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: `${tier.color}22`, color: tier.color }}
          >
            {tier.label}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">
            世代 <span className="font-mono text-gray-300">{steamTier}</span>
          </span>
          <span className="font-mono tabular-nums text-gray-300">
            {pressure.toFixed(0)}
            <span className="text-gray-600"> / {cap.toFixed(0)}</span>
          </span>
        </div>
      </div>

      {/* ── 刻度条：填充 = 当前压力，竖线 = 世代需求 ── */}
      <div className="relative">
        <div
          className="h-3 overflow-hidden rounded-md bg-gray-800"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={cap}
          aria-valuenow={pressure}
          aria-label={`蒸汽压力 ${pressure.toFixed(0)} / ${cap.toFixed(0)}，当前世代 ${steamTier} 需要 ${required}`}
        >
          {/* 分段底色：标示四个档位区间 */}
          <div className="absolute inset-0 flex">
            <div className="h-full bg-gray-800" style={{ width: '33%' }} />
            <div className="h-full bg-gray-800" style={{ width: '33%' }} />
            <div className="h-full bg-gray-800" style={{ width: '34%' }} />
          </div>
          <div
            className="relative h-full rounded-md transition-all duration-300"
            style={{
              width: `${burnedRatio * 100}%`,
              backgroundColor: ok ? tier.color : '#ef4444',
              boxShadow: `0 0 8px ${ok ? tier.color : '#ef4444'}66`,
            }}
          />
        </div>

        {/* 需求线：只有世代 I（需求 1）时不画，否则贴在左边缘没有信息量 */}
        {required > 1 && (
          <div
            className="pointer-events-none absolute -top-0.5 h-4 w-0.5 transition-all duration-300"
            style={{
              left: `${requiredRatio * 100}%`,
              backgroundColor: ok ? '#22c55e' : '#ef4444',
              boxShadow: `0 0 4px ${ok ? '#22c55e' : '#ef4444'}`,
            }}
            aria-hidden
          />
        )}
      </div>

      {/* ── 需求线说明 ── */}
      {required > 1 && (
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-gray-600">
            <span
              className="mr-1 inline-block h-2 w-0.5 align-middle"
              style={{ backgroundColor: ok ? '#22c55e' : '#ef4444' }}
            />
            世代 {steamTier} 需求线 {required}
          </span>
          <span className={ok ? 'text-green-300' : 'text-danger'}>
            {ok ? '压力充足' : `差 ${(required - pressure).toFixed(0)} 点 —— 蒸汽机喘振中（效率 ×0.4）`}
          </span>
        </div>
      )}

      {/* ── 司炉工与烧煤 ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
        <span className="font-mono tabular-nums">
          司炉工 {stokers}（上限 {(stokers * 5).toFixed(0)} 煤/秒）
        </span>
        <span className="font-mono tabular-nums">实烧 {coalBurned.toFixed(1)} 煤/秒</span>
        <span className="font-mono tabular-nums">
          锅炉房 {boilers}（上限 +{boilers * 20}）
        </span>
      </div>

      {/* ── 两类异常 ── */}
      {!ok && (
        <div className="rounded-md bg-red-500/10 px-3 py-1.5 text-xs text-danger">
          🔥 压力低于世代 {steamTier} 的需求 —— 刚研发的高效蒸汽机正在被腰斩。
          派更多司炉工，或加建锅炉房抬高上限。
        </div>
      )}
      {boilerNote && (
        <div className="rounded-md bg-orange-500/10 px-3 py-1.5 text-xs text-orange-300">
          {boilerNote}
        </div>
      )}
      {ok && required <= 1 && (
        <p className="text-[11px] leading-relaxed text-gray-600">
          世代 I（纽科门机）只需 1 点压力即可运转 —— 但它的效率极低。
          研究「斯米顿改良」「分离冷凝器」提升世代，代价是对压力要求更高。
        </p>
      )}
    </section>
  );
}

export default SteamGaugePanel;
