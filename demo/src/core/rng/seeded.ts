/** 可存档、可复现的轻量线性同余随机源。 */
export interface RngState {
  seed: number;
  cursor: number;
}

export interface RandomResult {
  value: number;
  state: RngState;
}

const MODULUS = 0x80000000;
const MULTIPLIER = 1103515245;
const INCREMENT = 12345;

export function createRngState(seed = Date.now()): RngState {
  return {
    seed: normalizeSeed(seed),
    cursor: 0,
  };
}

export function nextRandom(state: RngState): RandomResult {
  // Math.imul 保证乘法按 32 位整数执行，避免 Number 超过安全整数后失去确定性。
  const value = (Math.imul(MULTIPLIER, state.seed) + INCREMENT) >>> 0;
  const nextSeed = value % MODULUS;
  return {
    value: nextSeed / MODULUS,
    state: {
      seed: nextSeed === 0 ? 1 : nextSeed,
      cursor: state.cursor + 1,
    },
  };
}

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 1;
  const normalized = Math.abs(Math.floor(seed)) % MODULUS;
  return normalized === 0 ? 1 : normalized;
}
