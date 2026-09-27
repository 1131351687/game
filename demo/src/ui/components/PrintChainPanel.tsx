// 印刷链面板（E5 远洋时代）
//
// 四段链条：木材 →(造纸工)→ 纸张 →(印刷工)→ 典籍 →(学者)→ 研究点
// 与 E1–E4 的岗位不同，这一段**有物料输入**，因此会出现"有人在岗却产不出"。
//
// 本面板的核心职责是让玩家一眼看出**卡在哪一环**：
//   · 原料（木材见底）  · 产能（工位不够）  · 转化（下游学者不够）
//   · 存储（典籍溢出）
// 引擎的 calcPrintChain 已经把瓶颈算好了，这里只负责呈现，不重算公式。

import { useState } from 'react';
import { useStore, toEngineState } from '../../state/store';
import { aggregateEffects } from '../../game/engine';
import { calcPrintChain, getBookStorage, PAPER_MILL_SLOTS, PRINTING_WORKSHOP_SLOTS, UNIVERSITY_SLOTS } from '../../game/e5/print';
import { formatNumber } from '../../core/format';
import { Icon } from './Icon';

const SECTION_TITLE = 'text-xs uppercase tracking-wide text-gray-500';

/** 瓶颈 → 中文短标签与配色 */
const BOTTLENECK_INFO: Record<string, { text: string; color: string }> = {
  wood: { text: '原料不足 —— 木材见底', color: 'text-orange-300' },
  paper: { text: '中间品不足 —— 纸张不够', color: 'text-orange-300' },
  books: { text: '转化不足 —— 典籍不够', color: 'text-orange-300' },
  slots: { text: '产能不足 —— 工位不够', color: 'text-yellow-300' },
  none: { text: '链条通畅', color: 'text-green-300' },
};

export function PrintChainPanel({ className }: { className?: string }) {
  const state = useStore();
  const view = toEngineState(state);
  if (state.era !== 'E5') return null;

  const [open, setOpen] = useState(false); // 默认收起，与其他机制面板一致
  const eff = aggregateEffects(view);

  const chain = calcPrintChain(
    { era: state.era, wood: state.wood, paper: state.paper, books: state.books, jobs: state.jobs, buildings: state.buildings },
    {
      paperOutputMul: eff.paperOutputMul,
      printOutputMul: eff.printOutputMul,
      researchOutputMul: eff.researchOutputMul,
    }
  );

  const makers = state.jobs.papermaker ?? 0;
  const printers = state.jobs.printer ?? 0;
  const scholars = state.jobs.scholar ?? 0;
  const mills = state.buildings.paper_mill ?? 0;
  const shops = state.buildings.printing_workshop ?? 0;
  const unis = state.buildings.university ?? 0;

  const bookCap = getBookStorage(state, eff.bookCapacityAdd);
  const bookRatio = bookCap > 0 ? Math.min(1, state.books / bookCap) : 0;
  const binfo = BOTTLENECK_INFO[chain.bottleneck] ?? BOTTLENECK_INFO.none;

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
        <Icon emoji="🖨️" className="text-sm" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-200">印刷链 · 四段</div>
          <div className="truncate text-xs text-gray-500">
            木材 → 纸张 → 典籍 → 研究点；典籍会被学者<b>读掉</b>，掉库存是正常的
          </div>
        </div>
        <span className={`shrink-0 text-xs ${binfo.color}`}>
          {chain.bottleneck === 'none' ? '通畅' : '有瓶颈'}
        </span>
      </button>

      {open && (
        <div className="space-y-3">
          {/* ── 瓶颈横幅 ── */}
          <div
            className={`rounded-md px-3 py-1.5 text-xs ${
              chain.bottleneck === 'none'
                ? 'bg-green-500/10 text-green-300'
                : 'bg-orange-500/10 text-orange-300'
            }`}
          >
            {binfo.text}
          </div>

          {/* ── 四段明细 ── */}
          <div className="space-y-1.5">
            <h2 className={`flex items-center gap-1.5 ${SECTION_TITLE}`}>
              <Icon emoji="⛓️" className="text-xs" />
              <span>各段速率</span>
            </h2>
            <div className="space-y-1.5">
              <Stage
                icon="🪵"
                from="木材"
                to="纸张"
                workers={makers}
                slots={mills * PAPER_MILL_SLOTS}
                slotName="造纸坊"
                rate={chain.paperRate}
                drain={`耗木 ${chain.woodConsumed.toFixed(2)}/s`}
                stock={state.wood}
              />
              <Stage
                icon="📜"
                from="纸张"
                to="典籍"
                workers={printers}
                slots={shops * PRINTING_WORKSHOP_SLOTS}
                slotName="印书坊"
                rate={chain.bookRate}
                drain={`耗纸 ${(printers * 0.8).toFixed(2)}/s（名义）`}
                stock={state.paper}
              />
              <Stage
                icon="📖"
                from="典籍"
                to="研究点"
                workers={scholars}
                slots={unis * UNIVERSITY_SLOTS}
                slotName="大学"
                rate={chain.researchRate}
                drain={`读典 ${chain.booksConsumed.toFixed(2)}/s`}
                stock={state.books}
              />
            </div>
          </div>

          {/* ── 典籍存储（第四个瓶颈）── */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-gray-400">
                <Icon emoji="📚" className="text-xs" />
                <span>典籍存储</span>
              </span>
              <span className="font-mono tabular-nums text-gray-300">
                {formatNumber(state.books, 0)}
                <span className="text-gray-600"> / {formatNumber(bookCap, 0)}</span>
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-md bg-gray-800"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={bookCap}
              aria-valuenow={state.books}
              aria-label={`典籍 ${Math.round(state.books)} / ${Math.round(bookCap)}`}
            >
              <div
                className="h-full rounded-md transition-all duration-300"
                style={{
                  width: `${bookRatio * 100}%`,
                  backgroundColor: bookRatio >= 0.98 ? '#ef4444' : '#c084fc',
                }}
              />
            </div>
            {bookRatio >= 0.98 && (
              <div className="text-xs text-danger">
                典籍已满 —— 印刷工在浪费产能。造图书馆或让更多学者来读。
              </div>
            )}
          </div>

          <p className="text-xs leading-relaxed text-gray-600">
            缺料时按比例降速（不会报错、也不会照常产出）——
            「乘数再大也乘不了 0」。典籍是<b>消耗品</b>：学者把它读成研究点，
            所以典藏在链上转得越快，库存反而可能越少。
          </p>
        </div>
      )}
    </section>
  );
}

/** 单段：上游 → 下游 */
function Stage({
  icon,
  from,
  to,
  workers,
  slots,
  slotName,
  rate,
  drain,
  stock,
}: {
  icon: string;
  from: string;
  to: string;
  workers: number;
  slots: number;
  slotName: string;
  rate: number;
  drain: string;
  stock: number;
}) {
  const idle = workers > 0 && rate <= 0;
  const overstaffed = workers > slots;
  return (
    <div className="rounded-md bg-gray-900/40 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-gray-300">
          <Icon emoji={icon} className="text-sm" />
          <span className="font-medium">
            {from} → {to}
          </span>
        </span>
        <span
          className={`font-mono tabular-nums ${idle ? 'text-danger' : rate > 0 ? 'text-green-300' : 'text-gray-600'}`}
        >
          {rate.toFixed(2)}/s
        </span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
        <span className="font-mono tabular-nums">
          人手 {workers}
          <span className={overstaffed ? 'text-yellow-400' : 'text-gray-600'}>
            {' '}
            / 工位 {slots}
          </span>
        </span>
        <span className="font-mono tabular-nums">{drain}</span>
        <span className="font-mono tabular-nums">库存 {formatNumber(stock, 0)}</span>
      </div>
      {overstaffed && (
        <div className="mt-0.5 text-[11px] text-yellow-400">
          有 {workers - slots} 人没工位 —— 再造一座{slotName}扩产能。
        </div>
      )}
      {idle && (
        <div className="mt-0.5 text-[11px] text-danger">
          有人在岗但产不出 —— 上游断料。
        </div>
      )}
    </div>
  );
}

export default PrintChainPanel;
