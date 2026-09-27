// 能量链面板（E6 机器时代）
//
// 本面板是整个 E6 的**教学主面板**，地位等同 E5 的印刷链面板。
//
// 设计意图（E6-devplan §3.5）：
//   本代玩家要回答的唯一问题是「损耗在哪一环？」
//   因此面板必须把 η₁…η₅ **分环摊开**，而不是给一个笼统的"总效率 3%"。
//   只给总数的话，玩家只能盲目点科技；给了分环，他能看出
//   "我的 η₂ 是 2%，隔壁的 η₄ 是 94%"——该去点蒸汽机还是输电，一目了然。
//
// 面板还承担"两条路径对比"的职责：
//   直驱  η₁×η₂×η_trans(n)
//   电气化 η₁×η₂×η₃×η₄×η₅
// 两行并排显示，玩家会自己发现"电气化后总效率翻倍"，
// 这比任何教程文字都有效。

import { useState } from 'react';
import { useStore, toEngineState } from '../../state/store';
import { aggregateEffects } from '../../game/engine';
import { getEnergyChainView, getCoalBurned } from '../../game/e6/energy';
import { formatNumber } from '../../core/format';
import { Icon } from './Icon';

const SECTION_TITLE = 'text-xs uppercase tracking-wide text-gray-500';

export function EnergyChainPanel({ className }: { className?: string }) {
  const state = useStore();
  const view = toEngineState(state);
  // 时代门控：非 E6 直接不渲染（与其他机制面板一致）
  if (state.era !== 'E6') return null;

  const [open, setOpen] = useState(false);
  const eff = aggregateEffects(view);
  const e6fx = {
    boilerEtaAdd: eff.boilerEtaAdd,
    steamGenMul: eff.steamGenMul,
    scaleSlopeAdd: eff.scaleSlopeAdd,
    factoryOutMul: eff.factoryOutMul,
    railroadBonusMul: eff.railroadBonusMul,
  };

  const v = getEnergyChainView(view, e6fx);
  const rt = v.runtime;
  const factories = state.buildings.factory ?? 0;
  const electrified = rt.electrified;

  // 是否完全没起步：没工厂也没锅炉时不给噪音
  if (factories === 0 && (state.buildings.boiler_house ?? 0) === 0) return null;

  const coalBurned = getCoalBurned(view);
  const stokers = state.jobs.stoker ?? 0;
  const laborCap = stokers * 5;
  const coalStarved = coalBurned < laborCap - 1e-9; // 煤不够
  const laborStarved = coalBurned <= 0 && stokers > 0; // 人不够

  // 主计分板：当前生效的总效率
  const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

  return (
    <section
      className={
        className
          ? `${className} space-y-3 rounded-md border border-gray-800 bg-gray-900/30 px-3 py-3`
          : 'space-y-3 rounded-md border border-gray-800 bg-gray-900/30 px-3 py-3'
      }
    >
      <button
        type="button"
        onClick={() => setOpen(v2 => !v2)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-1 text-left transition-colors hover:bg-gray-800/50 hover:text-gray-100"
      >
        <span className="text-[10px] text-gray-500">{open ? '▼' : '▶'}</span>
        <Icon emoji="⚙️" className="text-sm" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-200">能量链 · 每转一环就漏一次</div>
          <div className="truncate text-xs text-gray-500">
            煤 → 热 → 机械能 {electrified ? '→ 电 → ' : '→ '}工厂；
            当前总效率 <span className="font-mono tabular-nums text-accent">{pct(v.totalEtaActive)}</span>
          </div>
        </div>
        <span
          className={`shrink-0 text-xs ${
            !v.pressureOk ? 'text-danger' : coalStarved ? 'text-orange-300' : 'text-green-300'
          }`}
        >
          {!v.pressureOk ? '喘振' : coalStarved ? '缺煤' : '通畅'}
        </span>
      </button>

      {open && (
        <div className="space-y-3">
          {/* ── 主计分板：煤 → 末端可用能 ── */}
          <div className="rounded-md bg-gray-900/40 px-3 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">煤 → 末端可用能（总效率）</span>
              <span className="font-mono text-sm tabular-nums text-accent">
                {pct(v.totalEtaActive)}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              烧煤 <span className="font-mono tabular-nums">{coalBurned.toFixed(1)}</span> 煤/秒
              → 毛机械能 <span className="font-mono tabular-nums">{formatNumber(rt.mechRaw, 0)}</span> kW
              → 轴端 <span className="font-mono tabular-nums">{formatNumber(rt.mechSupply, 0)}</span> kW
            </div>
          </div>

          {/* ── 分环效率（本面板的核心价值）── */}
          <div className="space-y-1.5">
            <h2 className={`flex items-center gap-1.5 ${SECTION_TITLE}`}>
              <Icon emoji="🔍" className="text-xs" />
              <span>各环效率 —— 损耗在哪一环？</span>
            </h2>
            <div className="space-y-1">
              <EtaRow icon="🔥" name="η₁ 锅炉热效率" hint="焦炭冶炼 +4.5%" value={v.etaBoiler} tone="#f97316" />
              <EtaRow
                icon="♨️"
                name="η₂ 蒸汽机世代"
                hint={`世代 ${v.steamTier}${v.pressureOk ? '' : ' · 喘振 ×0.4'}`}
                value={v.etaSteam}
                tone={v.pressureOk ? '#fbbf24' : '#ef4444'}
              />
              {electrified && (
                <EtaRow icon="🌀" name="η₃ 发电机" hint="固定 85%" value={v.etaGenerator} tone="#38bdf8" />
              )}
              {electrified && (
                <EtaRow
                  icon="🔌"
                  name="η₄ 输电"
                  hint={`${v.transmitLabel} · 电工可补偿`}
                  value={v.etaTransmit}
                  tone="#22d3ee"
                />
              )}
              {electrified && (
                <EtaRow icon="⚙️" name="η₅ 电动机" hint="固定 88%" value={v.etaMotor} tone="#a78bfa" />
              )}
              {!electrified && (
                <EtaRow
                  icon="🔗"
                  name="η_trans 传动轴"
                  hint={`1/(1+0.08×${factories}) —— 厂越多越亏`}
                  value={v.etaLineShaft}
                  tone="#f472b6"
                />
              )}
            </div>
          </div>

          {/* ── 两条路径对比 ── */}
          <div className="space-y-1.5">
            <h2 className={`flex items-center gap-1.5 ${SECTION_TITLE}`}>
              <Icon emoji="⚖️" className="text-xs" />
              <span>两条路径</span>
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <PathCard
                title="直驱"
                subtitle={`${factories} 座厂同一根轴`}
                value={v.totalEtaDirect}
                active={!electrified}
                tone="#f472b6"
              />
              <PathCard
                title="电气化"
                subtitle="发电厂 + 电网"
                value={v.totalEtaElectric}
                active={electrified}
                tone="#38bdf8"
              />
            </div>
            <p className="text-[11px] leading-relaxed text-gray-600">
              {electrified
                ? '电气化已接管。注意 η_trans 的"厂越多越亏"已经不再约束你——这正是修电网的意义。'
                : '直驱时 η_trans 随工厂数**下降**：厂越多，同一根轴亏得越狠。研发「电磁感应」修电网可绕过这条约束。'}
            </p>
          </div>

          {/* ── 缺煤诊断（两种熄火要分得开）── */}
          {(coalStarved || laborStarved) && (
            <div className="rounded-md bg-orange-500/10 px-3 py-1.5 text-xs text-orange-300">
              {laborStarved
                ? '煤在库里但烧不动 —— 司炉工不够，派更多人去司炉。'
                : '司炉工有空但煤见底 —— 扩煤矿或加派煤矿工。'}
            </div>
          )}

          {/* ── 工厂产能 ── */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-gray-400">
                <Icon emoji="🏭" className="text-xs" />
                <span>工厂能供率（机械能 / 需求）</span>
              </span>
              <span className="font-mono tabular-nums text-gray-300">
                {(rt.supplyRate * 100).toFixed(0)}%
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-md bg-gray-800"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={rt.supplyRate}
              aria-label={`工厂能供率 ${Math.round(rt.supplyRate * 100)}%`}
            >
              <div
                className="h-full rounded-md transition-all duration-300"
                style={{
                  width: `${rt.supplyRate * 100}%`,
                  backgroundColor: rt.supplyRate >= 0.98 ? '#22c55e' : rt.supplyRate > 0.5 ? '#fbbf24' : '#ef4444',
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-gray-500">
              <span className="font-mono tabular-nums">
                规模系数 ×{v.scaleCoef.toFixed(2)}（15 座封顶）
              </span>
              <span className="font-mono tabular-nums">
                产出 {v.factoryOutput.toFixed(1)} 工业品/秒
              </span>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-gray-600">
            <b>机械师不产生产能</b>——他的产出完全由这条链决定。
            机械能不够时多派机械师是纯浪费；先去解决煤、锅炉或输电。
          </p>
        </div>
      )}
    </section>
  );
}

/** 单环效率行 */
function EtaRow({
  icon,
  name,
  hint,
  value,
  tone,
}: {
  icon: string;
  name: string;
  hint: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-gray-900/40 px-3 py-1.5">
      <Icon emoji={icon} className="shrink-0 text-sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-gray-300">{name}</div>
        <div className="truncate text-[10px] text-gray-600">{hint}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="h-1.5 w-16 overflow-hidden rounded-md bg-gray-800">
          <div
            className="h-full rounded-md"
            style={{ width: `${Math.min(1, value) * 100}%`, backgroundColor: tone }}
          />
        </div>
        <span className="w-14 text-right font-mono text-xs tabular-nums" style={{ color: tone }}>
          {(value * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

/** 路径对比卡 */
function PathCard({
  title,
  subtitle,
  value,
  active,
  tone,
}: {
  title: string;
  subtitle: string;
  value: number;
  active: boolean;
  tone: string;
}) {
  return (
    <div
      className={`rounded-md px-3 py-2 ${
        active ? 'bg-gray-900/60 ring-1 ring-inset' : 'bg-gray-900/30 opacity-60'
      }`}
      style={active ? { boxShadow: `inset 0 0 0 1px ${tone}55` } : undefined}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-300">{title}</span>
        {active && <span className="text-[10px]" style={{ color: tone }}>生效中</span>}
      </div>
      <div className="mt-0.5 font-mono text-sm tabular-nums" style={{ color: tone }}>
        {(value * 100).toFixed(2)}%
      </div>
      <div className="text-[10px] text-gray-600">{subtitle}</div>
    </div>
  );
}

export default EnergyChainPanel;
