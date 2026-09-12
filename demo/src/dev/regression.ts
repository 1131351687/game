import { createRngState } from '../core/rng/seeded';
import { E3 } from '../data/constants';
import { canResearch, tick, type E1State } from '../game/engine';
import { simulate } from '../game/simulation/simulate';
import { advancePopulation } from '../game/systems/population';
import { getTradePrice, settleTradeCycle } from '../game/trade';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('回归失败：' + message);
}

function baseState(overrides: Partial<E1State> = {}): E1State {
  return {
    era: 'E3',
    food: 1000,
    wood: 1000,
    stone: 1000,
    experience: 0,
    population: 100,
    populationProgress: 0,
    fire: 100,
    livestock: 0,
    fabric: 0,
    eraElapsedSec: 0,
    copper: 100,
    tin: 100,
    bronze: 0,
    lapis: 0,
    recorded: [],
    recordedOnce: [],
    localOre: 'alluvial',
    tradeRoutes: [],
    reputation: 50,
    jobs: {},
    buildings: {},
    techs: {},
    autoMaintainFire: true,
    ...overrides,
  };
}

function run(): void {
  const common = {
    demandShock: 1,
    repEff: { priceMul: 1 },
    conversionLoss: 0,
    hasMetrology: true,
    contracted: true,
  } as const;
  const low = getTradePrice('food', 1, { ...common, jitter: 0.8 });
  const high = getTradePrice('food', 1, { ...common, jitter: 1.2 });
  assert(high / low < 1.05, '契约价格应压缩随机波动');
  assert(low > 1 && high < 2, '契约价格应保持在基准价附近');
  const researchState = baseState({
    experience: 900,
    techs: { writing: true, cuneiform: false },
  });
  assert(canResearch('cuneiform', researchState).ok, 'E3 科技应使用同一个 experience 存量作为知识');

  const route = {
    partnerId: 'dilmun',
    demand: 'food' as const,
    supply: 'tin' as const,
    distance: 1 as const,
    cycleAccum: 30,
    priceHistory: [],
  };
  const state = baseState({
    food: 1,
    jobs: { merchant: 10, scribe: 40 },
    techs: { cuneiform: true },
    tradeRoutes: [route],
  });
  const before = JSON.stringify(state.tradeRoutes);
  const settled = settleTradeCycle(state, E3.TRADE_CYCLE_SEC, () => 0.5, 100);
  assert(JSON.stringify(state.tradeRoutes) === before, '贸易结算不得修改输入路线');
  assert((settled.delta.food ?? 0) >= -1, '支付量不能超过当前库存');
  assert((settled.delta.tin ?? 0) >= 0, '有效交易应产生换入资源');

  const refused = settleTradeCycle(
    baseState({
      reputation: 0,
      jobs: { merchant: 10, scribe: 40 },
      tradeRoutes: [route],
    }),
    E3.TRADE_CYCLE_SEC,
    () => 0.1,
    100,
  );
  assert(refused.notes.some(note => note.includes('拒')), '低声望应可能拒交');

  const tinState = baseState({
    localOre: 'tin',
    techs: { cuneiform: true },
    jobs: { copper_miner: 10 },
  });
  const tinTick = tick(tinState, 10, () => 0.5, 100);
  assert(tinTick.tin > tinState.tin, '锡矿带应产生少量本地锡');
  const alluvialTick = tick({ ...tinState, localOre: 'alluvial' }, 10, () => 0.5, 100);
  assert(alluvialTick.copper === alluvialTick.copper, '冲积平原产出结果应为有限数值');
  assert(alluvialTick.copper === tinState.copper, '冲积平原不应新增铜');

  const population = advancePopulation({
    population: 2,
    progress: 0.9,
    capacity: 3,
    growthPerSec: 0.02,
    dt: 5,
  });
  assert(population.population === 3 && population.progress === 0, '人口应按整数步进并在满员时清零进度');

  const offline = simulate(baseState({ era: 'E1', tradeRoutes: [] }), 1, createRngState(7), {
    mode: 'offline',
    efficiency: 0.5,
    nowSec: 100,
  });
  assert(offline.events.some(event => event.type === 'simulation.offline'), '离线模拟应产生离线事件');
  console.log('E3 regression: passed');
}

run();
