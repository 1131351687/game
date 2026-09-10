import React from 'react';
import { GOVERNMENTS } from '../../game/engine';
import { useStore } from '../../state/store';

export const GovernmentPanel: React.FC = () => {
  const { government, changeGovernment } = useStore();

  return (
    <div className="bg-gray-800 rounded p-3">
      <p className="text-sm text-gray-400 mb-3">切换政府立即生效</p>
      <div className="space-y-2">
        {Object.entries(GOVERNMENTS).map(([id, gov]) => {
          const selected = government.regime === id;
          return (
            <button
              key={id}
              className={`w-full text-left p-2 rounded transition-colors ${
                selected
                  ? 'bg-gray-700 ring-2 ring-blue-500'
                  : 'bg-gray-900 hover:bg-gray-700'
              }`}
              onClick={() => changeGovernment(id)}
            >
              <p className="font-semibold text-gray-100">{gov.name}</p>
              <p className="text-xs text-gray-400 mt-1">
                经济 ×{gov.economy} / 科研 ×{gov.research} / 军事 {gov.military > 0 ? `+${gov.military}` : '—'}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};
