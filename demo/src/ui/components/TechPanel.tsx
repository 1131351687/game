import React from 'react';
import { useStore } from '../../state/store';
import { formatNumber } from '../../game/engine';

interface TechDef {
  id: string;
  name: string;
  effect: string;
}

const TECHS: TechDef[] = [
  { id: 'production_boost', name: '生产加成', effect: '全部产出 ×1.5' },
  { id: 'research_boost', name: '研究加成', effect: '科学家效率 ×1.5' },
];

export const TechPanel: React.FC = () => {
  const { techs, resources, unlockTech } = useStore();
  const researchCount = resources.research?.count ?? 0;

  return (
    <div className="bg-gray-800 rounded p-3">
      <p className="text-sm text-gray-400 mb-3">
        当前研究点数：<span className="text-blue-400 font-semibold">{formatNumber(researchCount)}</span> 🔬
      </p>
      <div className="space-y-2">
        {TECHS.map((tech) => {
          const state = techs[tech.id];
          const unlocked = state?.unlocked ?? false;
          return (
            <div
              key={tech.id}
              className={`p-2 rounded ${unlocked ? 'bg-gray-700' : 'bg-gray-900'}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-100">{tech.name}</p>
                  <p className="text-xs text-gray-400">{tech.effect}</p>
                </div>
                <span className="text-xs text-gray-500">100 🔬</span>
              </div>
              <button
                className="mt-2 w-full text-sm py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                disabled={unlocked || researchCount < 100}
                onClick={() => unlockTech(tech.id)}
              >
                {unlocked ? '已研究' : '研究'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
