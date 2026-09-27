// 电网面板（E6 机器时代）
//
// 只在**建有发电厂**时出现——没有发电厂就不存在电网，直驱玩家看不到这个面板。
//
// 设计意图（E6-devplan §3.5 / §3.2.1）：
//   电网的失败模式是**分档的**，不是连续的：
//     ρ ≥ 1.0  正常
//     0.6–1.0  按比例降产（隐性，玩家容易没察觉）
//     0.2–0.6  拉闸：额外拖累人口增长
//     < 0.2    崩溃：工厂只剩 30%
//   面板必须把这四档**画出来**，否则玩家只会看到"产出莫名其妙变少了"。
//   这就是为什么这里用四段色带而不是一根平滑的进度条。

import { useStore, toEngineState } from '../../state/store';
import { aggregateEffects } from '../../game/engine';
import { calcSupply, applyGridThrottle, getTransmitLabel } from '../../game/e6/energy';
import { E6 } from '../../data/constants';
import { formatNumber } from '../../core/format';
import { Icon } from './Icon';

export function GridPanel({ className }: { className?: string }) {
  const state = useStore();
  const view = toEngineState(state);
  if (state.era !== 'E6') return null;

  const plants = state.buildings.power_plant ?? 0;
  // 没有发电厂 = 没有电网，面板不出现
  if (plants === 0) return null;

  const eff = aggregateEffects(view);
  const e6fx = {
    boilerEtaAdd: eff.boilerEtaAdd,
    steamGenMul: eff.steamGenMul,
    scaleSlopeAdd: eff.scaleSlopeAdd,
    factoryOutMul: eff.factoryOutMul,
    railroadBonusMul: eff.railroadBonusMul,
  };

  const rt = calcSupply(view, e6fx);
  const throttle = applyGridThrottle(rt.rho);
  const rho = rt.rho;

  const status = throttle.blackout
    ? { text: '电网崩溃', color: '#ef4444', note: 'ρ < 0.2 —— 工厂只剩 30% 产出' }
    : throttle.brownout
      ? { text: '拉闸限电', color: '#f97316', note: 'ρ < 0.6 —— 工厂降产，且人口增长额外 −30%' }
      : rho < E6.RHO_FULL
        ? { text: '供电不足', color: '#fbbf24', note: 'ρ < 1.0 —— 工厂按比例降产' }
        : { text: '供电充足', color: '#22c55e', note: 'ρ ≥ 1.0 —— 工厂满负荷' };

  const transmit = getTransmitLabel(view);
  const electricians = state.jobs.electrician ?? 0;

  return (
    <section
      className={
        className
          ? `${className} space-y-2 rounded-md border border-gray-800 bg-gray-900/30 px-3 py-3`
          : 'space-y-2 rounded-md border border-gray-800 bg-gray-900/30 px-3 py-3'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon emoji="⚡" className="text-sm" />
          <span className="text-sm font-semibold text-gray-200">电网</span>
          <span
            className="rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: `${status.color}22`, color: status.color }}
          >
            {status.text}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">ρ</span>
          <span className="font-mono tabular-nums" style={{ color: status.color }}>
            {(rho * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* ── 四段色带（分档可视化）── */}
      <div className="relative h-3 overflow-hidden rounded-md">
        <div className="flex h-full w-full">
          <div className="h-full flex-[2]" style={{ backgroundColor: '#7f1d1d' }} />
          <div className="h-full flex-[4]" style={{ backgroundColor: '#78350f' }} />
          <div className="h-full flex-[4]" style={{ backgroundColor: '#713f12' }} />
          <div className="h-full flex-1" style={{ backgroundColor: '#14532d' }} />
        </div>
        {/* 当前 ρ 的指针 */}
        <div
          className="absolute -top-0.5 h-4 w-0.5 transition-all duration-300"
          style={{
            left: `${Math.min(1, rho) * 100}%`,
            backgroundColor: status.color,
            boxShadow: `0 0 4px ${status.color}`,
          }}
          aria-hidden
        />
      </div>
      {/* 分档刻度说明 */}
      <div className="flex justify-between text-[10px] text-gray-600">
        <span>0</span>
        <span className="ml-6">0.2 崩溃</span>
        <span>0.6 拉闸</span>
        <span>1.0</span>
      </div>

      {/* ── 供需明细 ── */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-gray-900/40 px-3 py-1.5">
          <div className="text-[10px] text-gray-600">发电 G</div>
          <div className="font-mono tabular-nums text-sky-300">
            {formatNumber(rt.gridG, 0)} kW
          </div>
        </div>
        <div className="rounded-md bg-gray-900/40 px-3 py-1.5">
          <div className="text-[10px] text-gray-600">用电 D</div>
          <div className="font-mono tabular-nums text-orange-300">
            {formatNumber(rt.gridD, 0)} kW
          </div>
        </div>
      </div>

      {/* ── 用电构成（帮玩家看出是谁在吃电）── */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
        <span className="font-mono tabular-nums">
          工厂 {(state.buildings.factory ?? 0) * E6.FACTORY_ELEC_KW} kW
        </span>
        <span className="font-mono tabular-nums">
          住宅 {(state.buildings.worker_housing ?? 0) * E6.HOUSING_ELEC_KW} kW
        </span>
        <span className="font-mono tabular-nums">
          锅炉 {(state.buildings.boiler_house ?? 0) * E6.BOILER_ELEC_KW} kW
        </span>
      </div>

      {/* ── 输电与电工 ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
        <span>
          输电方案 <span className="text-gray-300">{transmit}</span>
        </span>
        <span className="font-mono tabular-nums">
          电工 {electricians}（补偿 {Math.min(30, electricians * 1.5).toFixed(0)}%，上限 30%）
        </span>
      </div>

      {rho < E6.RHO_FULL && (
        <div
          className="rounded-md px-3 py-1.5 text-xs"
          style={{ backgroundColor: `${status.color}1a`, color: status.color }}
        >
          {status.note}
        </div>
      )}
    </section>
  );
}

export default GridPanel;
