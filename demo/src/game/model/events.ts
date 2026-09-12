import type { EraId } from '../../data/era';

/** 规则层事件；不携带 UI 组件或本地化文案。 */
export type GameEvent =
  | { type: 'trade.warning'; reason: 'missing_scribe' | 'missing_copper' | 'missing_tin' }
  | { type: 'era.advanced'; from: EraId; to: EraId }
  | { type: 'simulation.offline'; elapsedSec: number; effectiveSec: number };
