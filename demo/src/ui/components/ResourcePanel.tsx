// 资源面板：每个资源一行卡片，显示数量/存储/产出，提供 +1/+10/+100/Max 按钮
import { useStore } from '../../state/store';
import { formatNumber } from '../../game/engine';

const RESOURCES: { id: string; emoji: string; name: string }[] = [
  { id: 'food', emoji: '🍎', name: '食物' },
  { id: 'wood', emoji: '🌲', name: '木材' },
  { id: 'stone', emoji: '🪨', name: '石头' },
  { id: 'manpower', emoji: '👥', name: '人力' },
  { id: 'research', emoji: '🔬', name: '研究' },
];

const BUY_AMOUNTS = [1, 10, 100];

export default function ResourcePanel() {
  const resources = useStore(s => s.resources);
  const buyResource = useStore(s => s.buyResource);
  const buyResourceMax = useStore(s => s.buyResourceMax);

  const buyBtn = 'bg-green-600 hover:bg-green-500 rounded px-2 py-0.5 text-xs transition-colors';

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-bold text-gray-500 uppercase">资源</h2>
      {RESOURCES.map(({ id, emoji, name }) => {
        const r = resources[id];
        if (!r) return null;
        return (
          <div key={id} className="bg-gray-800 rounded p-2 flex items-center justify-between gap-2">
            <div className="text-sm">
              <span>{emoji} {name}</span>
              <div className="text-xs text-gray-400">
                {formatNumber(r.count)} / {formatNumber(r.storage)}
                <span className="text-green-400"> +{r.outputPerSecond.toFixed(1)}/s</span>
              </div>
            </div>
            <div className="flex gap-1">
              {BUY_AMOUNTS.map(n => (
                <button key={n} onClick={() => buyResource(id, n)} className={buyBtn}>
                  +{n}
                </button>
              ))}
              <button onClick={() => buyResourceMax(id)} className={buyBtn}>
                Max
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
