// 贸易面板（E3 城邦时代 · 贸易系统）
//
// 2026-09-13 改版（用户拍板）：
//   ① 贸易升格为独立板块（与工作/建筑/文明并列的第四个 Tab），
//      不再挤在左栏「状态」抽屉里 —— 那是它"看不到"的原因。
//   ② 路线的「付出 / 换得」货物可自选：五个邻邦保留历史默认配对，
//      但任何已开通路线都可换成全部可贸易物资（TRADABLE_RESOURCES）。
//   ③ 视觉与建筑列表同构：紧凑小方块（图标 + 名称 + 状态），
//      hover / 点击展开悬浮详情卡（说明、距离、价格、货物选择、路线操作）。
//
// 所有 emoji 走 <Icon>，兼容纯文字模式（showIcons=false 时正常排布）。
// 距离/价格公式不在此重复实现，全部从 trade.ts / data/constants 导入。

import { useState } from 'react';
import { useStore, toEngineState, type GameState } from '../../state/store';
import { aggregateEffects, type E1State } from '../../game/engine';
import {
  NEIGHBORS,
  TRADABLE_RESOURCES,
  getReputationEffect,
  getRouteSlots,
} from '../../game/trade';
import { E3 } from '../../data/constants';
import { RESOURCE_MAP, type ResourceId } from '../../data/resources';
import { formatNumber, formatPercent } from '../../core/format';
import { Icon } from './Icon';
import type { NeighborDef } from '../../game/trade';

/** 小号区块标题 */
const SECTION_TITLE = 'text-xs uppercase tracking-wide text-gray-500';

/** 把资源 id 转成中文名（数据驱动，不在 UI 硬编码） */
function resName(id: string): string {
  return RESOURCE_MAP[id as ResourceId]?.name ?? id;
}

export function TradePanel() {
  const state = useStore();
  const view = toEngineState(state);

  // 贸易系统是否开启 —— 由「商队组织」核心科技 caravan_org 解锁
  // （该科技解锁商人职业、商站、新增 2 条路线槽位）。
  const tradeEnabled = !!state.techs['caravan_org'];
  if (!tradeEnabled) return null;

  const eff = aggregateEffects(view);
  const rep = state.reputation;
  const repEff = getReputationEffect(rep);
  const merchants = state.jobs.merchant ?? 0;
  const nowSec = Date.now() / 1000;
  const contractSlots = eff.contractSlots;
  const activeContracts = state.tradeRoutes.filter(r => r.contractUntil !== undefined && r.contractUntil > nowSec).length;

  // 路线槽位：科技 routeSlotsAdd（商队组织 +2）+ 商栈×2 —— 统一走 getRouteSlots
  const slots = getRouteSlots(state);
  const used = state.tradeRoutes.length;
  const free = Math.max(0, slots - used);

  // 声望线性条比例
  const repRatio = Math.min(1, Math.max(0, rep / 100));

  return (
    <section className="space-y-4 pb-40">
      {/* 页头 */}
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={`flex items-center gap-1.5 ${SECTION_TITLE}`}>
          <Icon emoji="🐪" className="text-xs" />
          <span>贸易</span>
        </h2>
        <div className="text-xs text-gray-600">悬停邻邦查看详情，开通后可自选交易货物</div>
      </header>

      {/* ── 贸易仪表盘：带标签的分组网格，一眼对上号 ── */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 rounded-md bg-gray-900/40 px-4 py-3 sm:grid-cols-3">
        {/* 声望：线性条 + 数值 + 效果，占满一格 */}
        <div className="col-span-2 sm:col-span-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-gray-600">声望</span>
            <span className="text-xs tabular-nums text-gray-500">
              {repEff.priceMul < 1
                ? `全线价格 −${formatPercent(1 - repEff.priceMul)}`
                : repEff.priceMul > 1
                  ? `全线价格 +${formatPercent(repEff.priceMul - 1)}`
                  : '价格平稳'}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div
              className="relative h-1.5 flex-1 overflow-hidden rounded-md bg-gray-800"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={rep}
              aria-label={`声望 ${rep}`}
            >
              <div
                className="h-full rounded-md transition-all duration-300"
                style={{
                  width: `${repRatio * 100}%`,
                  // 低声望红色警示，高声望青色优惠，中段灰青
                  backgroundColor: rep <= E3.REP_LOW ? '#ef4444' : rep >= E3.REP_HIGH ? '#2dd4bf' : '#64748b',
                }}
              />
            </div>
            <span className="w-8 text-right font-mono text-xs font-semibold tabular-nums text-gray-200">
              {rep}
            </span>
          </div>
        </div>

        <DashboardCell label="贸易周期" value={`${E3.TRADE_CYCLE_SEC}s`} />
        <DashboardCell
          label="商人"
          value={String(merchants)}
          danger={merchants < 1}
          hint={merchants < 1 ? '需在「工作」分配' : undefined}
        />
        <DashboardCell
          label="路线"
          value={`${used} / ${slots}`}
          danger={free <= 0}
          hint={free <= 0 ? '槽位已满，建商站可扩' : undefined}
        />
        <DashboardCell label="契约" value={`${activeContracts} / ${contractSlots}`} />
      </div>

      {/* ── 邻邦网格：紧凑方块，hover / 点击出详情卡 ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {NEIGHBORS.map(n => (
          <NeighborTile key={n.id} def={n} state={state} view={view} />
        ))}
      </div>

      <p className="text-xs leading-relaxed text-gray-600">
        贸易周期 {E3.TRADE_CYCLE_SEC}s 一轮；每条路线需书吏 {formatNumber(eff.scribesPerRoute, 0)} 人，不足则效率下滑。
        声望 ≥{E3.REP_HIGH} 全线 −{formatPercent(1 - E3.REP_HIGH_DISCOUNT)}，≤{E3.REP_LOW} 全线 +{formatPercent(E3.REP_LOW_PENALTY - 1)} 且有拒交风险。
      </p>
    </section>
  );
}

/** 仪表盘单元格：标签灰、数值等宽；danger 时数值转红并附一句提示 */
function DashboardCell({
  label,
  value,
  danger,
  hint,
}: {
  label: string;
  value: string;
  danger?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-xs text-gray-600">{label}</div>
      <div
        className={`mt-0.5 font-mono text-sm tabular-nums ${danger ? 'text-red-400' : 'text-gray-100'}`}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] leading-tight text-gray-600">{hint}</div>}
    </div>
  );
}

/**
 * 单个邻邦方块（与建筑方块同构）。
 *
 * 常规态：图标 + 名称 + 配对摘要（开通中显示"付出→换得"图标，未开通置灰）；
 * 详情态（hover / 点击固定）：说明、距离系数、价格趋势、
 * 货物自选（付出/换得两个下拉，仅开通后可改）、开通/关闭/签约/毁约操作。
 */
function NeighborTile({
  def: n,
  state,
  view,
}: {
  def: NeighborDef;
  state: GameState;
  view: E1State;
}) {
  const [pinned, setPinned] = useState(false);

  const route = state.tradeRoutes.find(r => r.partnerId === n.id);
  const isOpen = !!route;
  const nowSec = Date.now() / 1000;
  const eff = aggregateEffects(view);

  // 青金石路线需 lapis_route 科技；未研究时禁用开通
  const lapisGated = n.sell === 'lapis' && !state.techs['lapis_route'];
  const slots = getRouteSlots(state);
  const noSlot = !isOpen && state.tradeRoutes.length >= slots;
  const blocked = lapisGated || noSlot;

  const transport = route?.transport ?? n.transport;
  const distFactor = 1 + E3.DISTANCE_COEFF * n.distance * (transport === 'water' ? eff.waterDistMul : 1);
  const history = route?.priceHistory ?? [];
  const latestPrice = history.length > 0 ? history[history.length - 1] : null;
  const previousPrice = history.length > 1 ? history[history.length - 2] : null;
  const trend = latestPrice === null || previousPrice === null
    ? '—'
    : latestPrice > previousPrice ? '↑' : latestPrice < previousPrice ? '↓' : '→';
  const statusLabel = route?.lastStatus === 'break'
    ? '商路中断'
    : route?.lastStatus === 'refused'
      ? '对方拒交'
      : route?.lastStatus === 'blocked'
        ? '等待条件'
        : route?.lastStatus === 'ok'
          ? '本期完成'
          : null;

  const demand = route?.demand ?? n.accept;
  const supply = route?.supply ?? n.sell;
  const activeContracts = state.tradeRoutes.filter(r => r.contractUntil !== undefined && r.contractUntil > nowSec).length;
  const contractSlots = eff.contractSlots;

  // 换得下拉的可选项：青金石需科技；排除与付出相同的资源
  const supplyOptions = TRADABLE_RESOURCES.filter(
    id => !(id === 'lapis' && !state.techs['lapis_route'])
  );

  return (
    <div
      className="relative"
      onMouseEnter={() => setPinned(true)}
      onMouseLeave={() => setPinned(false)}
    >
      {/* ── 紧凑方块 ── */}
      <button
        type="button"
        disabled={blocked}
        onClick={() => state.toggleRoute(n.id)}
        className={`flex w-full flex-col items-center gap-1 rounded-md border px-2 py-3 text-center transition-colors ${
          blocked
            ? 'cursor-not-allowed border-gray-800/60 bg-gray-900/20 opacity-50'
            : isOpen
              ? 'cursor-pointer border-teal-800/60 bg-gray-900/40 hover:border-teal-700 hover:bg-gray-800/60'
              : 'cursor-pointer border-gray-800 bg-gray-900/40 hover:border-gray-700 hover:bg-gray-800/60'
        }`}
      >
        <Icon emoji={n.icon} className="text-xl leading-none" />
        <span className="w-full truncate text-xs font-medium text-gray-200">{n.name}</span>
        {isOpen ? (
          <span className="flex items-center gap-0.5 font-mono text-xs tabular-nums text-teal-300/80">
            <Icon emoji={RESOURCE_MAP[demand].icon} className="text-[10px]" />
            <span>→</span>
            <Icon emoji={RESOURCE_MAP[supply].icon} className="text-[10px]" />
          </span>
        ) : (
          <span className="text-xs text-gray-600">{lapisGated ? '需科技' : '未开通'}</span>
        )}
      </button>

      {/* ── 悬浮详情卡 ── */}
      {pinned && (
        <div className="absolute left-1/2 top-full z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border border-gray-700 bg-gray-900 p-3 shadow-xl shadow-black/50">
          {/* 标题行 */}
          <div className="flex items-center gap-2">
            <Icon emoji={n.icon} className="text-lg leading-none" />
            <span className="text-sm font-semibold text-gray-100">{n.name}</span>
            <span className="ml-auto rounded-md bg-gray-800/60 px-1.5 py-0.5 text-xs tabular-nums text-gray-400">
              距离 {n.distance} · ×{distFactor.toFixed(2)}
            </span>
          </div>

          {/* 说明 */}
          <p className="mt-2 text-xs leading-relaxed text-gray-400">{n.desc}</p>

          {/* 状态徽章行 */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span
              className={`rounded-md px-1.5 py-0.5 tabular-nums ${
                isOpen ? 'bg-teal-500/15 text-teal-300' : 'bg-gray-800/60 text-gray-500'
              }`}
            >
              {isOpen ? '路线开通' : '未开通'}
            </span>
            {route && route.contractUntil !== undefined && route.contractUntil > nowSec && (
              <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 tabular-nums text-amber-300">
                契约 {Math.ceil(route.contractUntil - nowSec)}s
              </span>
            )}
            {route && route.breachPenaltyUntil !== undefined && route.breachPenaltyUntil > nowSec && (
              <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 tabular-nums text-red-300">
                违约惩罚 {Math.ceil(route.breachPenaltyUntil - nowSec)}s
              </span>
            )}
            {statusLabel && (
              <span className="rounded-md bg-gray-800/60 px-1.5 py-0.5 text-gray-400">{statusLabel}</span>
            )}
            <span className="font-mono tabular-nums text-gray-500">
              {transport === 'water' ? '水路' : '陆路'} · 近价{' '}
              {latestPrice === null ? '—' : latestPrice.toFixed(1)} {trend}
            </span>
          </div>

          {/* 货物自选（仅开通后可改） */}
          {isOpen ? (
            <div className="mt-2 space-y-1.5 border-t border-gray-800 pt-2">
              <div className="text-xs text-gray-600">交易货物（可自选全部物资）</div>
              <GoodsSelect
                label="付出"
                value={demand}
                exclude={supply}
                onChange={id => state.setRouteGoods(n.id, id, supply)}
              />
              <GoodsSelect
                label="换得"
                value={supply}
                exclude={demand}
                options={supplyOptions}
                onChange={id => state.setRouteGoods(n.id, demand, id)}
              />
            </div>
          ) : (
            <div className="mt-2 border-t border-gray-800 pt-2 text-xs text-gray-600">
              历史配对：付出 <span className="text-gray-300">{resName(n.accept)}</span> → 换得{' '}
              <span className="text-gray-300">{resName(n.sell)}</span>
              {blocked && (
                <span className="ml-1 text-danger/80">
                  （{lapisGated ? '需研究「青金石商路」' : '路线槽位已满'}）
                </span>
              )}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              disabled={blocked}
              onClick={() => state.toggleRoute(n.id)}
              className={`h-8 flex-1 rounded-md text-xs font-mono font-semibold transition-colors ${
                isOpen
                  ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25 active:bg-red-500/30'
                  : blocked
                    ? 'cursor-not-allowed text-gray-700'
                    : 'bg-teal-500/15 text-teal-300 hover:bg-teal-500/25 active:bg-teal-500/30'
              }`}
            >
              {isOpen ? '关闭路线' : '开通路线'}
            </button>
            {isOpen && route && route.contractUntil !== undefined && route.contractUntil > nowSec && (
              <button
                type="button"
                onClick={() => state.breachContract(n.id)}
                className="h-8 rounded-md bg-red-500/10 px-3 text-xs font-mono font-semibold text-red-300 hover:bg-red-500/20"
              >
                毁约
              </button>
            )}
            {isOpen && route && (route.contractUntil === undefined || route.contractUntil <= nowSec) && (
              <button
                type="button"
                disabled={activeContracts >= contractSlots}
                onClick={() => state.signContract(n.id)}
                className="h-8 rounded-md bg-amber-500/15 px-3 text-xs font-mono font-semibold text-amber-300 hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:text-gray-700"
                title={activeContracts >= contractSlots ? '契约槽位已满' : '签订锁价契约'}
              >
                签约
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 货物选择下拉：付出/换得共用。
 * exclude = 配对另一侧的货物（付出 ≠ 换得）；options 缺省为全部可贸易物资。
 */
function GoodsSelect({
  label,
  value,
  exclude,
  onChange,
  options,
}: {
  label: string;
  value: ResourceId;
  exclude: ResourceId;
  onChange: (id: ResourceId) => void;
  options?: ResourceId[];
}) {
  const list = options ?? TRADABLE_RESOURCES;
  return (
    <label className="flex items-center gap-2 text-xs text-gray-400">
      <span className="w-8 shrink-0">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value as ResourceId)}
        className="min-w-0 flex-1 rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 outline-none focus:border-gray-500"
      >
        {list.map(id => (
          <option key={id} value={id} disabled={id === exclude}>
            {/* 原生 <option> 无法走 <Icon> 组件，也就无法响应「显示图标」开关——
                直接只写名称，保证纯文字模式下不漏 emoji */}
            {RESOURCE_MAP[id].name}
          </option>
        ))}
      </select>
    </label>
  );
}

// App.tsx 以具名导入引用本组件；保留默认导出以兼容两种写法
export default TradePanel;
