import { nextRandom, type RngState } from '../../core/rng/seeded';
import { tick, type E1State, type TickResult } from '../engine';

export interface SimulationStepResult {
  result: TickResult;
  rng: RngState;
}

export interface SimulationOptions {
  mode: 'online' | 'offline' | 'test';
  efficiency?: number;
  maxStepSec?: number;
}

export interface SimulationResult {
  state: E1State;
  rng: RngState;
}

const DEFAULT_MAX_STEP_SEC = 0.25;
const MAX_SIMULATION_SEC = 8 * 60 * 60;

/** 执行一个规则步；随机源由调用方的存档状态推进。 */
export function simulateStep(
  state: E1State,
  dt: number,
  rngState: RngState,
): SimulationStepResult {
  let rng = rngState;
  const random = (): number => {
    const next = nextRandom(rng);
    rng = next.state;
    return next.value;
  };

  return {
    result: tick(state, dt, random),
    rng,
  };
}

/** 在线、离线和测试共用的 elapsed time 入口。 */
export function simulate(
  initial: E1State,
  elapsedSec: number,
  rngState: RngState,
  options: SimulationOptions,
): SimulationResult {
  const efficiency = options.efficiency ?? (options.mode === 'offline' ? 0.5 : 1);
  const maxStep = options.maxStepSec ?? DEFAULT_MAX_STEP_SEC;
  const total = Math.min(Math.max(0, elapsedSec * efficiency), MAX_SIMULATION_SEC);

  let remaining = total;
  let state = initial;
  let rng = rngState;

  while (remaining > 0) {
    const dt = Math.min(remaining, maxStep);
    const step = simulateStep(state, dt, rng);
    state = {
      ...state,
      ...step.result,
    };
    rng = step.rng;
    remaining -= dt;
  }

  return { state, rng };
}
