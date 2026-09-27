// 城市面板（E6 机器时代）
//
// 只在建有工人住宅或工厂时出现——城市化是这两个东西的产物。
//
// 设计意图（E6-devplan §3.5 / §4.2–4.4）：
//   本面板要把「增长率的代价」讲清楚。E6 的人口增长率
//       r = 0.02 × 拥挤系数 × 卫生因子 × 食物因子
//   其中后两个因子是**新的负向项**，前五个时代都没有。
//   玩家看到人口不涨时必须能立刻定位：是挤（该建住宅）还是脏（该点治理）？
//   因此这里把两个因子分别画条，并给出"最严重的问题"一句话诊断。

import { useStore, toEngineState } from '../../state/store';
import { aggregateEffects } from '../../game/engine';
import { getGrowthDiagnosis, getUrbanizationRate, getCapacityE6, countE6Techs } from '../../game/e6/urban';
import { E6 } from '../../data/constants';
import { formatNumber } from '../../core/format';
import { Icon } from './Icon';

export function CityPanel({ className }: { className?: string }) {
  const state = useStore();
  const view = toEngineState(state);
  if (state.era !== 'E6') return null;

  const housing = state.buildings.worker_housing ?? 0;
  const factories = state.buildings.factory ?? 0;
  // 城市化尚未起步时不渲染
  if (housing === 0 && factories === 0) return null;

  const eff = aggregateEffects(view);
  const e6ux = {
    pollutionReduce: eff.pollutionReduce,
    crowdingReduce: eff.crowdingReduce,
    knowledgePerPopAdd: eff.knowledgePerPopAdd,
  };

  const d = getGrowthDiagnosis(view, e6ux);
  const u = getUrbanizationRate(view);
  const k = getCapacityE6(view);
  const pollution = state.pollution ?? 0;
  const pop = state.population ?? 0;

  // r 的两个负向因子（与引擎同源：都从 urban.ts 取，不重算公式）
  const r = E6.POP_GROWTH_BASE * d.crowding * d.sanitation;

  const issueText =
    d.topIssue === 'crowding'
      ? '人口增长被**拥挤**拖住 —— 城市化率过高，加建工人住宅或研究城市排水系统。'
      : d.topIssue === 'pollution'
        ? '人口增长被**污染**拖住 —— 工厂的烟尘在杀人，研究公共卫生法或城市排水系统。'
        : '环境尚可，人口增长不受城市代价拖累。';

  return (
    <section
      className={
        className
          ? `${className} space-y-2 rounded-md border border-gray-800 bg-gray-900/30 px-3 py-3`
          : 'space-y-2 rounded-md border border-gray-800 bg-gray-900/30 px-3 py-3'
      }
    >
      <div className="flex items-center gap-2">
        <Icon emoji="🏙️" className="text-sm" />
        <span className="text-sm font-semibold text-gray-200">城市化与污染</span>
      </div>

      {/* ── 增长率 r 分解 ── */}
      <div className="rounded-md bg-gray-900/40 px-3 py-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">人口增长率 r（基础 {(E6.POP_GROWTH_BASE * 100).toFixed(1)}%）</span>
          <span className="font-mono tabular-nums text-accent">{(r * 100).toFixed(2)}%/s</span>
        </div>
        <div className="mt-1 text-[11px] text-gray-500">
          <span className="font-mono tabular-nums">× 拥挤 {d.crowding.toFixed(2)}</span>
          <span className="mx-1.5 text-gray-700">·</span>
          <span className="font-mono tabular-nums">× 卫生 {d.sanitation.toFixed(2)}</span>
          <span className="mx-1.5 text-gray-700">·</span>
          <span className="text-gray-600">× 食物（由粮食决定）</span>
        </div>
      </div>

      {/* ── 拥挤 / 卫生 两条 ── */}
      <div className="space-y-1.5">
        <FactorBar
          icon="👥"
          name="拥挤系数"
          hint={`城市化率 ${(u * 100).toFixed(0)}% —— 住宅承载 ${formatNumber(housing * E6.POP_K_PER_HOUSING, 0)} / 人口 ${formatNumber(pop, 0)}`}
          value={d.crowding}
          tone="#f472b6"
        />
        <FactorBar
          icon="☠️"
          name="卫生因子"
          hint={`污染 ${pollution.toFixed(1)} / ${E6.POLLUTION_CAP} —— 治理减免 ${(eff.pollutionReduce * 100).toFixed(0)}%`}
          value={d.sanitation}
          tone="#a3e635"
        />
      </div>

      {/* ── 诊断横幅 ── */}
      <div
        className={`rounded-md px-3 py-1.5 text-xs ${
          d.needsGovernance ? 'bg-orange-500/10 text-orange-300' : 'bg-green-500/10 text-green-300'
        }`}
      >
        {issueText.replace(/\*\*/g, '')}
      </div>

      {/* ── 承载与知识 ── */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
        <span className="font-mono tabular-nums">
          工人住宅 {housing} 座 → 承载 +{formatNumber(housing * E6.POP_K_PER_HOUSING, 0)}
        </span>
        <span className="font-mono tabular-nums">E6 承载 K = {formatNumber(k, 0)}</span>
        <span className="font-mono tabular-nums">
          已研究 E6 科技 {countE6Techs(view)}（知识复利 ×{(1 + E6.KNOWLEDGE_COMPOUND_SLOPE * countE6Techs(view)).toFixed(2)}）
        </span>
      </div>

      <p className="text-[11px] leading-relaxed text-gray-600">
        工业化让城市变脏、让人挤在一起 —— 这两个代价会连乘着压低 r。
        只堆工厂和住宅会把自己锁进死亡螺旋，<b>治理科技不是可选项</b>。
      </p>
    </section>
  );
}

/** 单因子条 */
function FactorBar({
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
  const bad = value < 0.8;
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
            style={{ width: `${Math.min(1, value) * 100}%`, backgroundColor: bad ? '#ef4444' : tone }}
          />
        </div>
        <span
          className="w-10 text-right font-mono text-xs tabular-nums"
          style={{ color: bad ? '#ef4444' : tone }}
        >
          {value.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

export default CityPanel;
