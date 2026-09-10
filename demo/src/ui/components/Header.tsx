// 顶部横栏：5 个资源概览 + 游戏时长 + 控制按钮（暂停/速度/存档）
import { useStore } from '../../state/store';
import { formatNumber, formatTime } from '../../game/engine';
import { saveGame } from '../../core/clock/scheduler';

const RESOURCE_META: { id: string; emoji: string; name: string }[] = [
  { id: 'food', emoji: '🍎', name: '食物' },
  { id: 'wood', emoji: '🌲', name: '木材' },
  { id: 'stone', emoji: '🪨', name: '石头' },
  { id: 'manpower', emoji: '👥', name: '人力' },
  { id: 'research', emoji: '🔬', name: '研究' },
];

const SPEEDS: (1 | 2 | 4 | 8)[] = [1, 2, 4, 8];

export default function Header() {
  const resources = useStore(s => s.resources);
  const stats = useStore(s => s.stats);
  const settings = useStore(s => s.settings);
  const togglePause = useStore(s => s.togglePause);
  const setSpeed = useStore(s => s.setSpeed);
  const addMessage = useStore(s => s.addMessage);

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(settings.speed);
    setSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
  };

  const handleSave = () => {
    saveGame();
    addMessage('已存档', 'save');
  };

  const btn = 'bg-gray-800 hover:bg-gray-700 rounded px-2 py-1 transition-colors';

  return (
    <header className="bg-gray-900 border-b border-gray-700 px-4 py-2 flex items-center gap-4 text-sm">
      {RESOURCE_META.map(({ id, emoji, name }) => {
        const r = resources[id];
        if (!r) return null;
        return (
          <div key={id} className="flex items-center gap-1" title={name}>
            <span>{emoji}</span>
            <span>
              {formatNumber(r.count)} / {formatNumber(r.storage)}
              <span className="text-green-400"> (+{formatNumber(r.outputPerSecond)}/s)</span>
            </span>
          </div>
        );
      })}

      <div className="ml-auto flex items-center gap-2">
        <span className="text-gray-400">⏱ {formatTime(stats.playTime)}</span>
        <button onClick={togglePause} className={btn}>
          {settings.pause ? '▶ 继续' : '⏸ 暂停'}
        </button>
        <button onClick={cycleSpeed} className={btn}>
          x{settings.speed}
        </button>
        <button onClick={handleSave} className={btn}>
          💾 存档
        </button>
      </div>
    </header>
  );
}
