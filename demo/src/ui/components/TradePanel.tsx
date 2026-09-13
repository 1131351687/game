// 贸易面板（E3 城邦时代 · 贸易系统）
//
// 设计意图：
//   本地锡产量恒为 0 → 青铜的另一半只能靠贸易进口。
//   玩家用商人沿路线跑商，付出货物换得货物。
//
// 本组件对标 RecordPanel：紧凑横向条状布局、深色简约。
// 结构：
//   🐪 贸易 [声望条] 52  周期 30s  本地矿藏 冲积平原
//   下面是 5 个固定邻邦列表，每项一个 开通/关闭 按钮。
//
// 所有 emoji 走 <Icon>，兼容纯文字模式（showIcons=false 时正常排布）。
// 距离/价格公式不在此重复实现，全部从 trade.ts / data/e3-trade.ts 导入。

import { useStore, toEngineState } from '../../state/store';
import { aggregateEffects } from '../../game/engine';
import { NEIGHBORS, getReputationEffect, getRouteSlots } from '../../game/trade';
import { E3 } from '../../data/constants';
import { RESOURCE_MAP, type ResourceId } from '../../data/resources';
import { formatNumber, formatPercent } from '../../core/format';
import { Icon } from './Icon';

/** 开通/关闭按钮：无边框轻量文字按钮，hover 时透出青色（贸易分支主色） */
const ROUTE_BTN =
  'inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-mono font-semibold tabular-nums transition-colors';

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
  // 未开启时整面板不渲染（与 RecordPanel 在 recordingEnabled=false 时返回 null 同理）。
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
    <section className="space-y-3 pb-40">
      {/* ── 贸易仪表盘（紧凑横向条，对标 RecordPanel 容量仪表盘）── */}
      <div className="flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto rounded-md bg-gray-900/40 px-4 py-2.5 text-sm leading-tight">
        {/* 标题 */}
        <span className="flex shrink-0 items-center gap-1.5 text-gray-400">
          <Icon emoji="🐪" className="text-sm" />
          <span>贸易</span>
        </span>

        {/* 声望线性条：0–100 */}
        <div
          className="relative h-2 min-w-[6rem] flex-1 overflow-hidden rounded-md bg-gray-800"
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

        {/* 声望数值 */}
        <span className="shrink-0 min-w-[3rem] text-right font-mono font-semibold tabular-nums text-gray-200">
          {rep}
        </span>

        {/* 声望效果提示 */}
        <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-gray-500">
          {repEff.priceMul < 1
            ? `全线 −${formatPercent(1 - repEff.priceMul)}`
            : repEff.priceMul > 1
              ? `全线 +${formatPercent(repEff.priceMul - 1)}`
              : '价格平稳'}
        </span>

        {/* 贸易周期 */}
        <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-gray-400">
          <Icon emoji="⏱️" className="text-xs" />
          <span className="font-mono tabular-nums">周期 {E3.TRADE_CYCLE_SEC}s</span>
        </span>

        {/* 商人数 */}
        <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-gray-400">
          <Icon emoji="🚶" className="text-xs" />
          <span className="font-mono tabular-nums">商人</span>
          <span
            className={`font-mono tabular-nums ${
              merchants < 1 ? 'text-danger' : 'text-gray-200'
            }`}
          >
            {merchants}
          </span>
        </span>

        {/* 路线槽位 */}
        <span
          className={`shrink-0 whitespace-nowrap text-xs tabular-nums ${
            free <= 0 ? 'text-danger' : 'text-gray-500'
          }`}
        >
          路线 {used} / {slots} · 契约 {activeContracts} / {contractSlots}
        </span>
      </div>

      {/* ── 5 个固定邻邦列表 ── */}
      <div className="space-y-2">
        <h2 className={`flex items-center gap-1.5 ${SECTION_TITLE}`}>
          <Icon emoji="🗺️" className="text-xs" />
          <span>贸易邻邦</span>
        </h2>

        {NEIGHBORS.map(n => {
          const route = state.tradeRoutes.find(r => r.partnerId === n.id);
          const isOpen = !!route;
          // 青金石路线需 lapis_route 科技；未研究时禁用开通
          const lapisGated = n.sell === 'lapis' && !state.techs['lapis_route'];
          // 槽位满且当前未开通 → 禁用
          const noSlot = !isOpen && free <= 0;
          const blocked = lapisGated || noSlot;

          // 距离系数（从 trade.ts 的公式：1 + DISTANCE_COEFF × distance）
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

          return (
            <div
              key={n.id}
              className="flex flex-col gap-3 rounded-md px-4 py-3.5 transition-colors hover:bg-gray-800/50 lg:flex-row lg:items-center lg:justify-between lg:gap-6"
            >
              {/* 左：图标 + 名称 + 说明 */}
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <Icon emoji={n.icon} className="text-2xl leading-none" />
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-gray-100">
                      {n.name}
                    </span>
                    <span className="rounded-md bg-gray-800/60 px-1.5 py-0.5 text-xs tabular-nums text-gray-400">
                      距离 {n.distance} · 系数 ×{distFactor.toFixed(2)}
                    </span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums ${
                        isOpen
                          ? 'bg-teal-500/15 text-teal-300'
                          : 'bg-gray-800/60 text-gray-500'
                      }`}
                    >
                      {isOpen ? '路线开通' : '未开通'}
                    </span>
                    {route && route.contractUntil !== undefined && route.contractUntil > nowSec && (
                      <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-xs tabular-nums text-amber-300">
                        契约 {Math.ceil(route.contractUntil - nowSec)}s
                      </span>
                    )}
                    {route && route.breachPenaltyUntil !== undefined && route.breachPenaltyUntil > nowSec && (
                      <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-xs tabular-nums text-red-300">
                        违约惩罚 {Math.ceil(route.breachPenaltyUntil - nowSec)}s
                      </span>
                    )}
                    {statusLabel && (
                      <span className="rounded-md bg-gray-800/60 px-1.5 py-0.5 text-xs text-gray-400">
                        {statusLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-gray-400">
                    {n.desc}
                  </p>
                  {/* 交易内容 */}
                  <p className="text-xs text-gray-600">
                    付出 <span className="text-gray-300">{resName(n.accept)}</span>
                    {' → '}换得 <span className="text-gray-300">{resName(n.sell)}</span>
                  </p>
                  <p className="font-mono text-xs tabular-nums text-gray-500">
                    近价 {latestPrice === null ? '—' : latestPrice.toFixed(1)} {trend}
                    {' · '}运输 {transport === 'water' ? '水路' : '陆路'}
                  </p>
                </div>
              </div>

              {/* 右：开通/关闭按钮 */}
              <div className="flex shrink-0 flex-col items-stretch gap-1.5 lg:w-48 lg:items-end">
                {/* 阻断原因（就近显示） */}
                {blocked && (
                  <span className="text-right text-xs tabular-nums text-danger/80">
                    {lapisGated
                      ? '需研究「青金石商路」'
                      : '路线槽位已满'}
                  </span>
                )}
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => state.toggleRoute(n.id)}
                  title={
                    blocked
                      ? lapisGated
                        ? '需先研究「青金石商路」科技'
                        : '路线槽位已满，无法开通'
                      : isOpen
                        ? `关闭与「${n.name}」的贸易路线`
                        : `开通与「${n.name}」的贸易路线`
                  }
                  className={`${ROUTE_BTN} ${
                    isOpen
                      ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25 active:bg-red-500/30'
                      : blocked
                        ? 'cursor-not-allowed text-gray-700'
                        : 'bg-teal-500/15 text-teal-300 hover:bg-teal-500/25 active:bg-teal-500/30'
                  }`}
                >
                  {isOpen ? '关闭' : '开通'}
                </button>
                {isOpen && route && route.contractUntil !== undefined && route.contractUntil > nowSec && (
                  <button
                    type="button"
                    onClick={() => state.breachContract(n.id)}
                    className="inline-flex h-9 items-center justify-center rounded-md bg-red-500/10 px-3 text-sm font-mono font-semibold text-red-300 hover:bg-red-500/20"
                  >
                    毁约
                  </button>
                )}
                {isOpen && route && (route.contractUntil === undefined || route.contractUntil <= nowSec) && (
                  <button
                    type="button"
                    disabled={activeContracts >= contractSlots}
                    onClick={() => state.signContract(n.id)}
                    className="inline-flex h-9 items-center justify-center rounded-md bg-amber-500/15 px-3 text-sm font-mono font-semibold text-amber-300 hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:text-gray-700"
                    title={activeContracts >= contractSlots ? '契约槽位已满' : '签订锁价契约'}
                  >
                    签约
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-gray-600">
        贸易周期 {E3.TRADE_CYCLE_SEC}s 一轮；每条路线需书吏 {formatNumber(eff.scribesPerRoute, 0)} 人，不足则效率下滑。
        声望 ≥{E3.REP_HIGH} 全线 −{formatPercent(1 - E3.REP_HIGH_DISCOUNT)}，≤{E3.REP_LOW} 全线 +{formatPercent(E3.REP_LOW_PENALTY - 1)} 且有拒交风险。
      </p>
    </section>
  );
}

// App.tsx 以具名导入引用本组件；保留默认导出以兼容两种写法
export default TradePanel;
