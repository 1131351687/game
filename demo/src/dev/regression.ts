import { createRngState } from '../core/rng/seeded';
import { E3, E4 } from '../data/constants';
import { aggregateEffects, calcExperienceOutput, canResearch, checkAdvance, getExpansionRequirement, getLegacyBonus, getLegionPower, getResourceStorage, getTerritoryOutputMultiplier, isBuildingUnlocked, tick, type E1State } from '../game/engine';
import { getBuildingCost } from '../game/engine';
import { computeEraTransition } from '../game/transition';
import { simulate } from '../game/simulation/simulate';
import { advancePopulation } from '../game/systems/population';
import { getTradePrice, settleTradeCycle } from '../game/trade';
import { isResourceRevealed } from '../game/reveal';

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
    iron: 0,
    coin: 0,
    territory: 1,
    legions: 0,
    expansionPending: null,
    p1Unlocked: false,
    legacyPoints: 0,
    recorded: [],
    recordedOnce: [],
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
  const waterPrice = getTradePrice('food', 3, { ...common, jitter: 1, distanceMultiplier: 1.5 });
  const landPrice = getTradePrice('food', 3, { ...common, jitter: 1, distanceMultiplier: 1 });
  assert(waterPrice > landPrice, '水路距离修正应同时影响展示价格');

  const e1Visibility = baseState({ era: 'E1', techs: { fire: true, stone_knapping: true } });
  assert(!isResourceRevealed('copper', e1Visibility), 'E1 不应显示铜');
  assert(!isResourceRevealed('bronze', e1Visibility), 'E1 不应显示青铜');
  const e3Visibility = baseState({ era: 'E3', techs: { cuneiform: true } });
  assert(isResourceRevealed('copper', e3Visibility), 'E3 书写后应显示铜');
  assert(!isResourceRevealed('bronze', e3Visibility), '未研究冶炼前不应显示青铜');

  const reachableE3 = baseState({
    era: 'E3',
    population: 1800,
    bronze: 2000,
    recorded: ['iron', 'writing', 'cuneiform', 'bronze_smelting', 'bronze_tools', 'wheel', 'caravan_org', 'metrology', 'lapis_route', 'textile', 'city_planning', 'law'],
    techs: { iron: true },
    buildings: { academy: 3, trading_post: 2 },
  });
  assert(checkAdvance(reachableE3).ok, 'E3 的全部条件应可达并允许进入交接状态');
  const researchState = baseState({
    experience: 900,
    techs: { writing: true, cuneiform: false },
  });
  assert(canResearch('cuneiform', researchState).ok, 'E3 科技应使用同一个 experience 存量作为知识');
  assert(researchState.experience >= 800, 'E3 楔形文字研究成本应能从 experience 存量支付');
  assert(researchState.techs.writing === true, 'E3 楔形文字应以书写为研究前置');
  const bootstrapState = baseState({
    experience: 0,
    population: 100,
    techs: { writing: true },
    jobs: {},
  });
  assert(calcExperienceOutput(bootstrapState) > 0, 'E3 楔形文字研究前应保留过渡经验产出');
  const bootstrapTick = tick(bootstrapState, 10, () => 0.5, 100);
  assert(bootstrapTick.experience > 0, 'E3 入口应能积累足够经验研究楔形文字');
  const scribeState = baseState({
    experience: 10,
    population: 100,
    techs: { cuneiform: true },
    jobs: { scribe: 10 },
  });
  const knowledgeRate = calcExperienceOutput(scribeState);
  assert(knowledgeRate > 0, 'E3 分配书吏后知识产出应大于 0');
  const knowledgeTick = tick(scribeState, 10, () => 0.5, 100);
  assert(knowledgeTick.experience > scribeState.experience, 'E3 tick 应将书吏知识写回 experience');

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

  const interrupted = settleTradeCycle(
    baseState({
      jobs: { merchant: 10, scribe: 40 },
      techs: { cuneiform: true },
      tradeRoutes: [route],
    }),
    E3.TRADE_CYCLE_SEC,
    () => 0.01,
    100,
  );
  assert(interrupted.routes[0].lastStatus === 'break', '确定性中断应更新路线状态');
  assert(interrupted.notes.some(note => note.includes('中断')), '商路中断应写入反馈');

  // 矿工科技链：铜矿开采点亮后矿工产铜；未点亮时不产（矿脉随机制已废除）
  const miningState = baseState({
    techs: { cuneiform: true, copper_mining: true },
    jobs: { miner: 10 },
  });
  const miningTick = tick(miningState, 10, () => 0.5, 100);
  assert(miningTick.copper > miningState.copper, '铜矿开采后矿工应产出铜');
  const noMiningTick = tick({ ...miningState, techs: { cuneiform: true } }, 10, () => 0.5, 100);
  assert(noMiningTick.copper === miningState.copper, '未研究铜矿开采时矿工不产铜');

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

  const transition = computeEraTransition({
    ...baseState({
      copper: 321,
      tin: 123,
      bronze: 456,
      lapis: 7,
      recorded: ['writing'],
      recordedOnce: ['writing', 'cuneiform'],
      reputation: 73,
      tradeRoutes: [route],
    }),
  }, 'E4');
  assert(transition.era === 'E4' && transition.bronze === 456, 'E3 资产应透传到 E4');
  assert(transition.recorded?.length === 1 && transition.tradeRoutes?.length === 1, 'E3 记录与贸易路线应透传到 E4');

  const e4 = baseState({
    era: 'E4',
    population: 1000,
    food: 10000,
    iron: 0,
    coin: 0,
    territory: 3,
    jobs: { iron_miner: 10, mint_worker: 10 },
    buildings: { mint: 1 },
    techs: { iron_tools: true, minting: true },
  });
  const baseIronStorage = E4.IRON_STORAGE_BASE + (e4.territory - 1) * E4.IRON_STORAGE_PER_TERRITORY;
  const opening = baseState({
    era: 'E4',
    territory: 1,
    wood: 2000,
    iron: E4.IRON_STORAGE_BASE,
  });
  assert(getBuildingCost('mint', opening).iron! <= E4.IRON_STORAGE_BASE, '首座铸币厂必须能在初始铁上限内建造');
  assert(getBuildingCost('legion_camp', opening).iron! <= E4.IRON_STORAGE_BASE, '首座军团营垒必须能在初始铁上限内建造');
  assert(getBuildingCost('mint', opening).wood! <= opening.wood, '首座铸币厂必须能在 E4 开局木材内建造');
  assert(getBuildingCost('legion_camp', opening).wood! <= opening.wood, '首座军团营垒必须能在 E4 开局木材内建造');
  assert(isBuildingUnlocked('mint', { ...opening, techs: { coinage: true } }), '铸币制度应解锁铸币厂');
  assert(!isBuildingUnlocked('mint', opening), '未研究铸币制度时不应解锁铸币厂');
  assert(getResourceStorage('iron', e4) === baseIronStorage, 'E4 铁库存由基础储量与版图共同决定');
  assert(getResourceStorage('iron', { ...e4, buildings: { armory: 2 } }) > baseIronStorage, '武库应扩充铁库存上限');
  const steelEffects = aggregateEffects({ ...e4, techs: { iron: true, steel: true } });
  assert(steelEffects.ironOutputMul > 1.09, 'E4 钢铁效果不应被 E3 刻录惩罚错误减半');
  const e4Tick = tick(e4, 10, () => 0.5, 100);
  assert(e4Tick.iron > e4.iron, 'E4 铁矿工应产铁');
  assert(e4Tick.coin > e4.coin && e4Tick.iron < e4.iron + 10 * E4.IRON_MINER_RATE * 10, '铸币应由铁供应并消耗铁');
  assert(getResourceStorage('iron', e4) >= e4Tick.iron, '铁应受 E4 存储上限约束');

  const baseRequirement = getExpansionRequirement(e4);
  assert(baseRequirement !== null && baseRequirement.targetN === 4, 'E4 应给出下一块版图的征伐要求');
  assert(getExpansionRequirement({ ...e4, territory: E4.MAX_TERRITORY }) === null, '版图达到上限后不应再要求征伐');
  const powered = {
    ...e4,
    buildings: { ...e4.buildings, legion_camp: 4, armory: 2 },
    techs: { ...e4.techs, legion_organization: true, military_merit: true },
  };
  assert(getLegionPower(powered) > getLegionPower(e4), '军团科技与武库应提高综合战力');
  assert(getExpansionRequirement(powered)!.legionNeed < baseRequirement!.legionNeed, '战力提升应降低征伐所需兵力');
  assert(getLegacyBonus({ ...e4, p1Unlocked: false, legacyPoints: 10 }) === 1, 'P1 未解锁时遗产收益应保持中性');
  assert(getLegacyBonus({ ...e4, p1Unlocked: true, legacyPoints: 4 }) > getLegacyBonus({ ...e4, p1Unlocked: true, legacyPoints: 1 }), '遗产点应提高实际产出倍率');
  assert(getTerritoryOutputMultiplier({ ...e4, territory: 5 }) > getTerritoryOutputMultiplier({ ...e4, territory: 1 }), '版图扩大应提高物产收益');
  const pendingExpansion = tick({
    ...e4,
    eraElapsedSec: 19,
    territory: 1,
    expansionPending: { until: 20, targetN: 2 },
  }, 1, () => 0.5, 100);
  assert(pendingExpansion.territory === 2 && pendingExpansion.expansionPending === null, '平定期到期应完成一格版图扩张');
  const e5Ready = {
    ...e4,
    techs: { ...e4.techs, unification: true },
    territory: 20,
    coin: 150000,
    buildings: { ...e4.buildings, legion_camp: 4 },
  };
  assert(checkAdvance(e5Ready).ok, '统一条件满足时应允许完成 E4');
  assert(!checkAdvance({ ...e5Ready, territory: 19 }).ok, '版图不足 20 时不得完成统一');
  assert(!checkAdvance({ ...e5Ready, coin: 149999 }).ok, '铸币不足时不得完成统一');
  console.log('E1-E4 regression: passed');
}

run();
