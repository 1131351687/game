// 知识复利面板（E5 远洋时代 · 核心机制）
//
// 复利是 E5 的机制承载体：研究速度 = 印刷产能 B × 复利倍率 R(N) × 识字率因子。
//   R = 1 + k × N_eff，N = 本时代已解锁的 E5 科技数
//
// 本面板要让玩家看懂三件事：
//   ① N 现在是多少、R 是多少（一眼看到"点科技有用"）
//   ② N_eff 的分段递减——超过 20 项后收益腰斩（避免玩家误以为线性堆叠）
//   ③ ★忍耐期：印刷链早期消耗一切、产出为零，这是设计而非故障
//
// ⚠️ R 是 (N, k) 的纯函数，本组件**每帧现算**，绝不从 state 里读缓存值。
//    一旦读缓存，玩家点完科技会看到 R 下一个 tick 才变，手感就断了。

import { useState } from 'react';
import { useStore, toEngineState } from '../../state/store';
import { aggregateEffects } from '../../game/engine';
import { getCompoundBreakdown, getNeff } from '../../game/e5/compound';
import { E5 } from '../../data/constants';
import { techsOfEra } from '../../data/techs';
import { Icon } from './Icon';

/** 小号区块标题（与 RecordPanel / FireDashboard 统一） */
const SECTION_TITLE = 'text-xs uppercase tracking-wide text-gray-500';

export function CompoundPanel({ className }: { className?: string }) {
  const state = useStore();
  const view = toEngineState(state);
  // 复利只在 E5 有意义；未进入 E5 整面板不渲染（与 RecordPanel 同理）
  if (state.era !== 'E5') return null;

  const [open, setOpen] = useState(true); // 复利是 E5 的主角，默认展开
  const eff = aggregateEffects(view);
  const b = getCompoundBreakdown(view, { compoundKAdd: eff.compoundKAdd });

  // E5 科技总数（分母）——让玩家知道"还有多少项可点"
  const e5Total = techsOfEra('E5').length;

  // k 的构成拆解：把每一项加项的来源标出来，玩家才明白"研究哪项能提高 k"
  const kSources = [
    { id: 'printing', label: '印刷术', add: 0.05 },
    { id: 'movable_type', label: '金属活字', add: 0.01 },
    { id: 'university_system', label: '大学制度', add: 0.01 },
    { id: 'workshop_division', label: '印坊分工', add: 0.01 },
    { id: 'scientific_method', label: '科学方法', add: 0.02 },
  ];

  // ── ★忍耐期判定 ──
  //
  // 印刷链的产出为零、而玩家已经投入了造纸工/印刷工，说明链条还没转起来。
  // 这是 E5 最容易被误认为"游戏坏了"的时刻，必须显式告知。
  const invested = (state.jobs.papermaker ?? 0) + (state.jobs.printer ?? 0) > 0;
  const starving = invested && b.n < 5;

  // 下一项科技的边际收益：再点 1 项，R 会涨多少
  const rNext = 1 + b.k * getNeff(b.n + 1);
  const rGain = Math.min(rNext, E5.COMPOUND_R_CAP) - b.r;

  return (
    <section
      className={
        className
          ? `${className} space-y-3 rounded-md border border-gray-800 bg-gray-900/30 px-3 py-3`
          : 'space-y-3 rounded-md border border-gray-800 bg-gray-900/30 px-3 py-3'
      }
    >
      {/* ── 折叠头 ── */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-1 text-left transition-colors hover:bg-gray-800/50 hover:text-gray-100"
      >
        <span className="text-[10px] text-gray-500">{open ? '▼' : '▶'}</span>
        <Icon emoji="✨" className="text-sm" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-200">知识复利</div>
          <div className="truncate text-xs text-gray-500">
            R = 1 + k × N_eff —— 本时代每多研究一项科技，研究速度就更快一分
          </div>
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-purple-300">
          ×{b.r.toFixed(2)}
        </span>
      </button>

      {open && (
        <div className="space-y-3">
          {/* ── ★忍耐期警示（E5 最关键的玩家体验节点）── */}
          {starving && (
            <div className="rounded-md border border-orange-500/40 bg-orange-500/10 px-3 py-2">
              <div className="flex items-start gap-2">
                <Icon emoji="⏳" className="mt-0.5 shrink-0 text-sm" />
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-semibold text-orange-300">
                    忍耐期 —— 印刷链正在吞掉你的一切
                  </div>
                  <p className="text-xs leading-relaxed text-orange-200/80">
                    造纸工在吃木材、印刷工在吃纸张，而<b>研究点此刻还是 0</b>。
                    这不是故障：印刷链必须先把料自下而上填满
                    （木材 → 纸张 → 典籍），学者才有书可读。
                    链条转起来之后，复利会把这些投入成倍还给你。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── 主仪表：R 的构成 ── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="本时代科技 N" value={`${b.n} / ${e5Total}`} tone="gray" />
            <Metric label="有效科技 N_eff" value={b.nEff.toFixed(1)} tone="gray" />
            <Metric label="复利系数 k" value={b.k.toFixed(2)} tone="purple" />
            <Metric
              label="复利倍率 R"
              value={`×${b.r.toFixed(2)}`}
              tone={b.capped ? 'warn' : 'purple'}
            />
          </div>

          {/* R 上限提示 —— 让玩家知道天花板在哪 */}
          {b.capped ? (
            <div className="rounded-md bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
              复利已达绝对上限 ×{E5.COMPOUND_R_CAP.toFixed(2)} —— 再加科技不会更快。
            </div>
          ) : (
            <div className="rounded-md bg-gray-900/40 px-3 py-1.5 text-xs text-gray-400">
              再研究 1 项 E5 科技 → R 变为{' '}
              <span className="font-mono tabular-nums text-purple-300">
                ×{Math.min(rNext, E5.COMPOUND_R_CAP).toFixed(3)}
              </span>
              （+{rGain.toFixed(3)}）
            </div>
          )}

          {/* ── N_eff 分段递减说明 ── */}
          <div className="space-y-1.5">
            <h2 className={`flex items-center gap-1.5 ${SECTION_TITLE}`}>
              <Icon emoji="📉" className="text-xs" />
              <span>有效科技数分段</span>
            </h2>
            <div className="space-y-1 rounded-md bg-gray-900/40 px-3 py-2 text-xs">
              <SegRow
                label={`1 – ${E5.NEFF_SEG1_MAX}`}
                mult="每项算 1.0"
                active={b.n <= E5.NEFF_SEG1_MAX}
              />
              <SegRow
                label={`${E5.NEFF_SEG1_MAX + 1} – ${E5.NEFF_SEG2_MAX}`}
                mult={`每项算 ${E5.NEFF_SEG2_SLOPE}`}
                active={b.n > E5.NEFF_SEG1_MAX && b.n <= E5.NEFF_SEG2_MAX}
              />
              <SegRow
                label={`${E5.NEFF_SEG2_MAX + 1} 以上`}
                mult={`每项算 ${E5.NEFF_SEG3_SLOPE}`}
                active={b.n > E5.NEFF_SEG2_MAX}
              />
              <div className="pt-1 text-gray-500">
                硬上限 N_eff = {E5.NEFF_CAP}（约 N = 53 时触顶）
              </div>
            </div>
          </div>

          {/* ── k 的构成：告诉玩家"哪项科技能提高 k" ── */}
          <div className="space-y-1.5">
            <h2 className={`flex items-center gap-1.5 ${SECTION_TITLE}`}>
              <Icon emoji="🔑" className="text-xs" />
              <span>复利系数 k 的来源</span>
            </h2>
            <div className="space-y-0.5 rounded-md bg-gray-900/40 px-3 py-2 text-xs">
              {kSources.map(src => {
                const owned = !!state.techs[src.id];
                return (
                  <div key={src.id} className="flex items-center justify-between gap-2">
                    <span className={owned ? 'text-gray-300' : 'text-gray-600'}>
                      {owned ? '✓ ' : '· '}
                      {src.label}
                    </span>
                    <span
                      className={`font-mono tabular-nums ${
                        owned ? 'text-purple-300' : 'text-gray-700'
                      }`}
                    >
                      +{src.add.toFixed(2)}
                    </span>
                  </div>
                );
              })}
              <div className="mt-1 flex items-center justify-between border-t border-gray-800 pt-1">
                <span className="text-gray-400">合计 k</span>
                <span className="font-mono tabular-nums text-gray-200">{b.k.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* ── 识字率因子（R 的另一个乘数）── */}
          <p className="text-xs leading-relaxed text-gray-600">
            研究速度 = 印刷产能 × <span className="text-purple-400">复利 R</span> × 识字率因子。
            R 只放大研究点，不放大木材与纸张 —— 产量跟不上时，乘数再大也乘不了 0。
            跨代后 N 归零（复利是本时代的特权），k 也会随时代衰减。
          </p>
        </div>
      )}
    </section>
  );
}

/** 指标块 */
function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'gray' | 'purple' | 'warn';
}) {
  const color =
    tone === 'purple' ? 'text-purple-300' : tone === 'warn' ? 'text-red-300' : 'text-gray-200';
  return (
    <div className="rounded-md bg-gray-900/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`font-mono text-base font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

/** 分段行：命中当前区段时高亮 */
function SegRow({ label, mult, active }: { label: string; mult: string; active: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded px-1.5 py-0.5 ${
        active ? 'bg-purple-500/15 text-purple-200' : 'text-gray-500'
      }`}
    >
      <span className="font-mono tabular-nums">{label}</span>
      <span className="font-mono tabular-nums">{mult}</span>
    </div>
  );
}

export default CompoundPanel;
