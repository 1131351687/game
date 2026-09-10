// 季节面板 —— E2 定居时代的常驻核心元素（对应 E1 的火种仪表盘）
//
// 位置：App.tsx 中紧邻 FireDashboard 之下、Tab 栏之上。
// 渲染条件：仅当季节循环开启（即已研究核心科技「农业」）。
//   —— 未开启时 return null，**不产生任何 DOM 与布局位移**，
//      所以 E1 远古时代的界面逐像素不变。
//
// 设计依据：design/game/eras/E2-sedentary.md §13「UI 要点」。
// 本时代最重要的不是"现在多危险"，而是"**未来**多危险"——
// 因此这里给出越冬预报（预计冬耗 vs 当前储备 vs 缺口），
// 让"今年能不能撑到春天"变成一个一眼可见的量。
//
// 紧凑横向条布局（高度 ≤ 64px）：与 FireDashboard 保持同一视觉语言。
// 所有 emoji 走 <Icon>，遵守「纯文字模式」开关；季节配色用内联十六进制，
// 避免 Tailwind 动态类名在构建时不被生成。

import { useStore, toEngineState } from '../../state/store';
import { aggregateEffects, getResourceStorage } from '../../game/engine';
import {
  SEASONS,
  SEASON_ORDER,
  SEASON_DURATION_SEC,
  getSeasonFromElapsed,
  getSeasonProgress,
  getYearIndex,
  getSecondsToWinter,
  getWinterConsumption,
} from '../../game/season';
import { formatNumber } from '../../core/format';
import { Icon } from './Icon';

/** 越冬安全线：储备 ≥ 冬耗的 1.25 倍才算宽裕（留出牲畜饲料与人口增长的余量） */
const SAFE_MARGIN = 1.25;

export function SeasonBar() {
  const s = useStore();
  const view = toEngineState(s);

  // 季节循环未开启（E1，或 E2 尚未研究「农业」）→ 整个面板不存在
  if (!aggregateEffects(view).seasonsEnabled) return null;

  const season = getSeasonFromElapsed(s.eraElapsedSec);
  const def = SEASONS[season];
  const progress = getSeasonProgress(s.eraElapsedSec);
  const year = getYearIndex(s.eraElapsedSec) + 1;
  const seasonLeft = Math.ceil(SEASON_DURATION_SEC * (1 - progress));

  // ── 越冬预报 ──
  const toWinter = getSecondsToWinter(s.eraElapsedSec);
  const winterNeed = getWinterConsumption(s.population);
  const grain = s.grain;
  const gap = winterNeed - grain;
  const isAutumn = season === 'autumn';

  // 缺口配色：秋季仍不足 → 红 + 脉冲（最紧急）；其余季节不足 → 琥珀；充足 → 灰
  const warnClass =
    gap <= 0
      ? 'text-gray-500'
      : gap > 0 && isAutumn
        ? 'animate-pulse text-red-400'
        : 'text-amber-400';

  // ── 谷仓容量 ──
  const grainCap = getResourceStorage('grain', view);
  const capRatio = Number.isFinite(grainCap) && grainCap > 0 ? Math.min(1, grain / grainCap) : 0;
  const nearFull = capRatio >= 0.9;

  return (
    <section className="flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto border-b border-gray-800 px-4 py-2 text-sm leading-tight">
      {/* ── 当前季节：图标 + 中文名 ── */}
      <span className="flex shrink-0 items-center gap-1.5" style={{ color: def.barColor }}>
        <Icon emoji={def.icon} className="text-sm" />
        <span className="font-semibold">{def.name}</span>
      </span>

      {/* ── 当季进度条（细条，融入页面；颜色随季节变化）── */}
      <div
        className="relative h-2 min-w-[6rem] flex-1 overflow-hidden rounded-md bg-gray-800/60"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-label={`${def.name}季进度 ${Math.round(progress * 100)}%`}
      >
        <div
          className="h-full rounded-md transition-all duration-300"
          style={{ width: `${progress * 100}%`, backgroundColor: def.barColor }}
        />
      </div>

      {/* ── 本季剩余 ── */}
      <span className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-gray-500">
        剩 {seasonLeft}s
      </span>

      {/* ── 四季横向条：当前季高亮 ── */}
      <span className="flex shrink-0 items-center gap-1">
        {SEASON_ORDER.map(id => {
          const d = SEASONS[id];
          const active = id === season;
          return (
            <span
              key={id}
              title={d.desc}
              className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors ${
                active ? 'font-semibold text-gray-900' : 'text-gray-600'
              }`}
              style={active ? { backgroundColor: d.barColor } : undefined}
            >
              <Icon emoji={d.icon} className="text-xs" />
              <span>{d.name}</span>
            </span>
          );
        })}
      </span>

      {/* ── 年份 + 当季农业倍率（把"季节对产出的作用"直接摆出来）── */}
      <span className="shrink-0 whitespace-nowrap text-xs text-gray-500">
        第 <span className="font-mono tabular-nums text-gray-300">{year}</span> 年
      </span>
      <span className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-gray-500">
        农业 ×{def.agriMultiplier}
      </span>

      {/* ── 谷仓容量（接近满仓时变黄，提示"该建粮仓了"）── */}
      <span className="shrink-0 whitespace-nowrap text-xs">
        <span className="text-gray-600">谷仓 </span>
        <span
          className={`font-mono tabular-nums ${nearFull ? 'text-amber-400' : 'text-gray-400'}`}
          title={
            nearFull
              ? '接近满仓 —— 溢出部分会被直接浪费，考虑建造粮仓或陶窑'
              : '秋收集中在秋季，容量不足就会眼看着烂掉'
          }
        >
          {formatNumber(grain, 0)} / {formatNumber(grainCap, 0)}
        </span>
        {nearFull && <span className="text-amber-400"> ⚠ 将溢出</span>}
      </span>

      {/* ── 越冬预报（本时代最重要的前瞻信息）── */}
      <span className={`shrink-0 whitespace-nowrap text-xs ${warnClass}`}>
        {isAutumn ? (
          gap > 0 ? (
            <>
              入冬前还差 <span className="font-mono tabular-nums font-semibold">{formatNumber(gap, 0)}</span> 谷物
            </>
          ) : (
            <>
              过冬储备充足 <span className="font-mono tabular-nums">（余 {formatNumber(-gap, 0)}）</span>
            </>
          )
        ) : (
          <>
            距入冬 <span className="font-mono tabular-nums">{Math.round(toWinter)}s</span>
            <span className="text-gray-600"> ｜ 冬耗 </span>
            <span className="font-mono tabular-nums">{formatNumber(winterNeed, 0)}</span>
            {gap > 0 && (
              <>
                <span className="text-gray-600"> ｜ 缺口 </span>
                <span className="font-mono tabular-nums font-semibold">{formatNumber(gap, 0)}</span>
              </>
            )}
            {gap <= 0 && (
              <>
                <span className="text-gray-600"> ｜ 储备 </span>
                <span className="font-mono tabular-nums">
                  {grain >= winterNeed * SAFE_MARGIN ? '宽裕' : '够用'}
                </span>
              </>
            )}
          </>
        )}
      </span>
    </section>
  );
}

// App.tsx 以具名导入引用本组件；保留默认导出以兼容两种写法
export default SeasonBar;
