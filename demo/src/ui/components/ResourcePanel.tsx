// 资源状态区：每项资源一行（数量 / 上限 / 产出速率），人口单独一行
import { useEffect, useRef, useState } from 'react';
import { useStore, toEngineState } from '../../state/store';
import { MATERIAL_RESOURCES, RESOURCE_MAP, type ResourceId } from '../../data/resources';
import { isResourceRevealed } from '../../game/reveal';
import {
  calcExperienceOutput,
  calcResourceOutput,
  getCapacity,
  getFoodConsumption,
  getPopulationGrowth,
  getResourceStorage,
} from '../../game/engine';
import { formatNumber, formatRate } from '../../core/format';

/**
 * 数值变化时返回 true 并保持 400ms —— 用于上限/容量变化时的短暂高亮。
 * 只挂在上限这类"低频变化"的值上，避免每 tick 都在闪。
 */
function useFlash(value: number): boolean {
  const prev = useRef(value);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 400);
    return () => window.clearTimeout(timer);
  }, [value]);

  return flash;
}

interface ResourceRowProps {
  id: ResourceId;
  amount: number;
  /** Infinity 表示无上限（经验） */
  storage: number;
  rate: number;
  /** 附加说明（如食物的消耗速率） */
  note?: string;
}

function ResourceRow({ id, amount, storage, rate, note }: ResourceRowProps) {
  const def = RESOURCE_MAP[id];
  const storageFlash = useFlash(storage); // 上限变化时高亮

  const infinite = !Number.isFinite(storage);
  const full = !infinite && amount >= storage;
  const rateZero = Math.abs(rate) < 0.0001;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-lg leading-none">{def.icon}</span>
        <div className="min-w-0">
          <div className="text-sm text-gray-300">{def.name}</div>
          <div className="text-[11px] text-gray-500">
            {/* 数量 / 上限：经验无上限显示「—」 */}
            <span className="tabular-nums text-gray-400">{formatNumber(amount, 1)}</span>
            <span className="mx-1 text-gray-600">/</span>
            <span
              className={`tabular-nums transition-colors duration-300 ${
                storageFlash ? 'rounded bg-blue-500/30 px-1 text-blue-200' : 'text-gray-500'
              }`}
            >
              {infinite ? '—' : formatNumber(storage, 0)}
            </span>
            {full && <span className="ml-2 text-amber-400">已满</span>}
          </div>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div
          className={`text-sm font-semibold tabular-nums ${
            rateZero ? 'text-gray-500' : 'text-green-400'
          }`}
        >
          {formatRate(rate)}/秒
        </div>
        {note && <div className="text-[11px] tabular-nums text-gray-500">{note}</div>}
      </div>
    </div>
  );
}

export function ResourcePanel() {
  const state = useStore();
  const view = toEngineState(state);

  const capacity = getCapacity(view); // 人口上限 K
  const capFlash = useFlash(capacity);
  const growth = getPopulationGrowth(view);
  const assigned = Object.values(state.jobs).reduce((sum, n) => sum + n, 0);
  const idle = Math.max(0, state.population - assigned);

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">📦 资源</h2>

      {MATERIAL_RESOURCES.filter(id => isResourceRevealed(id, view)).map(id => {
        // 经验走独立的产出函数，其余资源按岗位产出汇总
        const rate = id === 'experience' ? calcExperienceOutput(view) : calcResourceOutput(id, view);
        const storage = getResourceStorage(id, view);
        const amount = id === 'experience' ? state.experience : state[id];

        return (
          <ResourceRow
            key={id}
            id={id}
            amount={amount}
            storage={storage}
            rate={rate}
            note={id === 'food' ? `消耗 -${getFoodConsumption(view).toFixed(1)}/秒` : undefined}
          />
        );
      })}

      {/* ── 人口单独一行 ── */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-lg leading-none">{RESOURCE_MAP.population.icon}</span>
          <div className="min-w-0">
            <div className="text-sm text-gray-300">{RESOURCE_MAP.population.name}</div>
            <div className="text-[11px] text-gray-500">
              <span className="tabular-nums text-gray-400">
                {formatNumber(state.population, 1)}
              </span>
              <span className="mx-1 text-gray-600">/</span>
              <span
                className={`tabular-nums transition-colors duration-300 ${
                  capFlash ? 'rounded bg-blue-500/30 px-1 text-blue-200' : 'text-gray-500'
                }`}
              >
                {formatNumber(capacity, 0)}
              </span>
              <span className="ml-2 text-gray-600">K = {formatNumber(capacity, 0)}</span>
            </div>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div
            className={`text-sm font-semibold tabular-nums ${
              growth < 0 ? 'text-red-400' : growth > 0 ? 'text-green-400' : 'text-gray-500'
            }`}
          >
            {formatRate(growth)}/秒
          </div>
          <div className="text-[11px] tabular-nums text-gray-500">
            空闲 {formatNumber(idle, 0)} · 在岗 {formatNumber(assigned, 0)}
          </div>
        </div>
      </div>

      {growth < 0 && (
        <p className="text-[11px] text-red-400">
          ⚠️ 人口正在流失 —— 检查火种与食物产出
        </p>
      )}
    </section>
  );
}

// App.tsx 目前以默认导入引用本组件，这里保留默认导出以兼容两种写法
export default ResourcePanel;
