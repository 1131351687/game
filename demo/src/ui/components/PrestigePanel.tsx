import React from 'react';
import { useStore } from '../../state/store';
import { formatNumber } from '../../game/engine';

export const PrestigePanel: React.FC = () => {
  const { prestige, stats, doPrestige } = useStore();
  const canGain = Math.floor(stats.totalFood / 1e6);
  const pointsGained = Math.floor(Math.sqrt(canGain));
  const disabled = pointsGained < 1;

  return (
    <div className="bg-gray-800 rounded p-3">
      <div className="space-y-1 text-sm text-gray-300 mb-3">
        <p>重置等级：<span className="text-yellow-400 font-semibold">{prestige.level}</span></p>
        <p>总点数：<span className="text-yellow-400 font-semibold">{prestige.points}</span></p>
        <p>累计食物：<span className="text-gray-100">{formatNumber(stats.totalFood)}</span></p>
        <p className="text-gray-400">
          本次重置可获得：<span className="text-yellow-300 font-semibold">{pointsGained}</span> 点
        </p>
      </div>
      <button
        className="w-full py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (window.confirm('确定要重置文明吗？将清空资源与岗位，保留成就与点数。')) {
            doPrestige();
          }
        }}
      >
        重置文明
      </button>
      <p className="mt-2 text-xs text-gray-500">
        重置会清空资源与岗位，保留成就与点数。每个点提供 +5% 全局产出。
      </p>
    </div>
  );
};
