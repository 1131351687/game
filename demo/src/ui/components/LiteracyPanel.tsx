// 识字率面板（E5 远洋时代）
//
// 识字率是 0–100 的**状态值，不是资源**：不占储存、不进资源栏，增长是逻辑斯谛的。
// 它同时放大三件事：研究速度、人口增长、远航成功率。
//
// 本面板要让玩家看懂：识字率上限由**大学数量**决定（15% + 每座 15%，硬顶 95%），
// 而增长快慢由**典籍产能**决定。所以"造大学"是抬高天花板，"修印刷链"是加快爬升。

import { useState } from 'react';
import { useStore, toEngineState } from '../../state/store';
import { aggregateEffects } from '../../game/engine';
import { calcPrintChain } from '../../game/e5/print';
import { getLiteracyBreakdown, getLiteracyUpperBound } from '../../game/e5/literacy';
import { E5 } from '../../data/constants';
import { Icon } from './Icon';

const SECTION_TITLE = 'text-xs uppercase tracking-wide text-gray-500';

export function LiteracyPanel({ className }: { className?: string }) {
  const state = useStore();
  const view = toEngineState(state);
  if (state.era !== 'E5') return null;

  const [open, setOpen] = useState(false);
  const eff = aggregateEffects(view);

  const chain = calcPrintChain(
    { era: state.era, wood: state.wood, paper: state.paper, books: state.books, jobs: state.jobs, buildings: state.buildings },
    {
      paperOutputMul: eff.paperOutputMul,
      printOutputMul: eff.printOutputMul,
      researchOutputMul: eff.researchOutputMul,
    }
  );

  const teachers = state.jobs.teacher ?? 0;
  const unis = state.buildings.university ?? 0;
  const b = getLiteracyBreakdown(state.literacy, chain.bookRate, teachers, unis, eff.literacyCapAdd);

  const ratio = b.cap > 0 ? Math.min(1, Math.max(0, b.literacy / b.cap)) : 0;

  // 下一座大学的边际：上限 +15%
  const nextCap = getLiteracyUpperBound(unis + 1, eff.literacyCapAdd) * 100;
  const capGain = nextCap - b.cap;

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
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-1 text-left transition-colors hover:bg-gray-800/50 hover:text-gray-100"
      >
        <span className="text-[10px] text-gray-500">{open ? '▼' : '▶'}</span>
        <Icon emoji="🎓" className="text-sm" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-200">识字率</div>
          <div className="truncate text-xs text-gray-500">
            同时放大研究速度、人口增长与远航成功率
          </div>
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-gray-300">
          {b.literacy.toFixed(1)}%
          <span className="text-gray-600"> / {b.cap.toFixed(0)}%</span>
        </span>
      </button>

      {open && (
        <div className="space-y-3">
          {/* ── 进度条 ── */}
          <div className="space-y-1">
            <div
              className="h-2.5 overflow-hidden rounded-md bg-gray-800"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={b.cap}
              aria-valuenow={b.literacy}
              aria-label={`识字率 ${b.literacy.toFixed(1)}% / ${b.cap.toFixed(0)}%`}
            >
              <div
                className="h-full rounded-md transition-all duration-300"
                style={{ width: `${ratio * 100}%`, backgroundColor: '#c084fc' }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                距上限还差{' '}
                <span className="font-mono tabular-nums text-gray-300">
                  {(b.cap - b.literacy).toFixed(1)}
                </span>{' '}
                个百分点
              </span>
              <span className="font-mono tabular-nums">剩余空间 {(b.headroom * 100).toFixed(0)}%</span>
            </div>
          </div>

          {/* ── 三路加成 ── */}
          <div className="space-y-1.5">
            <h2 className={`flex items-center gap-1.5 ${SECTION_TITLE}`}>
              <Icon emoji="📈" className="text-xs" />
              <span>识字率因子 ×{b.factor.toFixed(2)}</span>
            </h2>
            <div className="space-y-0.5 rounded-md bg-gray-900/40 px-3 py-2 text-xs">
              <Row label="研究速度" value={`×${b.factor.toFixed(3)}`} />
              <Row label="人口增长" value={`×${b.factor.toFixed(3)}`} />
              <Row
                label="远航成功率"
                value={`+${(E5.VOYAGE_LITERACY_BONUS * (b.literacy / 100)).toFixed(3)}`}
              />
            </div>
          </div>

          {/* ── 增长驱动 ── */}
          <div className="space-y-1.5">
            <h2 className={`flex items-center gap-1.5 ${SECTION_TITLE}`}>
              <Icon emoji="⚙️" className="text-xs" />
              <span>增长驱动</span>
            </h2>
            <div className="space-y-0.5 rounded-md bg-gray-900/40 px-3 py-2 text-xs">
              <Row
                label="印刷产能因子"
                value={`×${b.printFactor.toFixed(2)}`}
                hint={`典籍产能 ${chain.bookRate.toFixed(2)}/s（≥2.0 时饱和）`}
              />
              <Row
                label="教师"
                value={`${teachers} 人 → ×${b.teacherMul.toFixed(1)}`}
                tone={teachers < 1 ? 'dim' : 'normal'}
              />
              <Row label="逻辑斯谛余量" value={`${(b.headroom * 100).toFixed(0)}%`} />
            </div>
          </div>

          {/* ── 上限来源 ── */}
          <div className="rounded-md bg-gray-900/40 px-3 py-2 text-xs text-gray-400">
            上限 = 15%（基础）+ 大学 {unis} 座 × 15% ={' '}
            <span className="font-mono tabular-nums text-purple-300">{b.cap.toFixed(0)}%</span>
            {b.cap < 95 && (
              <>
                {' '}
                · 再建 1 座大学 → {nextCap.toFixed(0)}%
                {capGain > 0 && <span className="text-green-400">（+{capGain.toFixed(0)}%）</span>}
              </>
            )}
            {b.cap >= 95 && <span className="text-gray-500"> · 已达硬顶 95%</span>}
          </div>

          <p className="text-xs leading-relaxed text-gray-600">
            识字率不直接产出任何东西，却同时放大三件事 —— 这是 E5 里最慢、
            也最不该被忽略的一条线。上限 95% 意味着<b>永远留 5% 的文盲</b>：
            识字率不是"满了就没事了"的开关。
          </p>
        </div>
      )}
    </section>
  );
}

function Row({
  label,
  value,
  hint,
  tone = 'normal',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'normal' | 'dim';
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-500">
        {label}
        {hint && <span className="ml-1 text-gray-700">({hint})</span>}
      </span>
      <span
        className={`font-mono tabular-nums ${tone === 'dim' ? 'text-danger' : 'text-gray-300'}`}
      >
        {value}
      </span>
    </div>
  );
}

export default LiteracyPanel;
