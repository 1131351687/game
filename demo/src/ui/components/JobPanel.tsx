// 岗位面板：每个岗位一行，显示人数/总产出，提供 -1/+1/+10/Max 按钮
import { useStore } from '../../state/store';
import { formatNumber, calcJobOutput, JOB_DEFS } from '../../game/engine';

const JOB_META: { id: string; emoji: string; name: string }[] = [
  { id: 'farmer', emoji: '🌾', name: '农夫' },
  { id: 'lumberjack', emoji: '🪓', name: '伐木工' },
  { id: 'miner', emoji: '⛏️', name: '矿工' },
  { id: 'scientist', emoji: '🧪', name: '科学家' },
];

const OUTPUT_EMOJI: Record<string, string> = {
  food: '🍎',
  wood: '🌲',
  stone: '🪨',
  research: '🔬',
};

export default function JobPanel() {
  const jobs = useStore(s => s.jobs);
  const resources = useStore(s => s.resources);
  const setJobCount = useStore(s => s.setJobCount);

  const manpower = resources.manpower.count;

  const jobBtn = 'bg-gray-700 hover:bg-gray-600 rounded px-2 py-0.5 text-xs transition-colors';

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-bold text-gray-500 uppercase">岗位</h2>
      {JOB_META.map(({ id, emoji, name }) => {
        const job = jobs[id];
        const def = JOB_DEFS[id as keyof typeof JOB_DEFS];
        if (!job || !def) return null;
        const output = calcJobOutput(id, job.count);
        return (
          <div key={id} className="bg-gray-800 rounded p-2">
            <div className="text-sm flex items-center justify-between">
              <span>
                {emoji} {name}
                <span className="text-xs text-gray-400"> ×{job.count}</span>
              </span>
              <span className="text-xs text-green-400">
                {OUTPUT_EMOJI[def.output]} {output.toFixed(1)}/s
              </span>
            </div>
            <div className="flex gap-1 mt-1">
              <button onClick={() => setJobCount(id, job.count - 1)} className={jobBtn}>
                -1
              </button>
              <button onClick={() => setJobCount(id, job.count + 1)} className={jobBtn}>
                +1
              </button>
              <button onClick={() => setJobCount(id, job.count + 10)} className={jobBtn}>
                +10
              </button>
              <button onClick={() => setJobCount(id, manpower)} className={jobBtn}>
                Max
              </button>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-gray-500">可用人力：{formatNumber(manpower)}</p>
    </section>
  );
}
