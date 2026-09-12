// 贸易系统（E3 城邦时代）
//
// 核心约束：本地锡产量恒为 0 —— 青铜的另一半只能靠贸易。
// 贸易是"虚拟邻邦"模型：玩家用商人沿路线跑商，付出货物换得货物。
//
// 结算：每 30 秒一个商队周期（E3.TRADE_CYCLE_SEC）。
// 价格：基准价 × 距离系数 × 需求冲击 × 随机波动 × 声望 × 契约锁定 × 换算损耗。
//
// ⚠️ 本模块只做纯计算（读 state → 返回结算结果），状态变更由 store/tick 落库。

import { E3 } from '../data/constants';
import { aggregateEffects } from './engine';
import type { E1State, TradeRoute } from './engine';
import type { ResourceId } from '../data/resources';

/**
 * 固定 5 个贸易邻邦（用户拍板：写死，不做随机化；随机留给 P2 重玩层）。
 *
 * 设计意图（贴合苏美尔主线）：
 * · 两河流域缺石缺木 → 有石头/木材进口路线
 * · 锡几乎只产自远方 → 距离 1 的近邻迪尔蒙是**唯一**锡源（途径波斯湾贸易中转站，
 *   实际历史上的锡来自伊朗/阿富汗，这里为游戏性做近邻化处理）
 * · 青金石商路是"远方奢华"——距离 3，需「青金石商路」科技解锁
 */
export interface NeighborDef {
  id: string;
  name: string;
  icon: string;
  distance: 1 | 2 | 3;
  /** 我方支付的货物 */
  accept: ResourceId;
  /** 我方换得的货物 */
  sell: ResourceId;
  /** 一句话描述（中文） */
  desc: string;
}

export const NEIGHBORS: NeighborDef[] = [
  {
    id: 'dilmun',
    name: '迪尔蒙',
    icon: '🏝️',
    distance: 1,
    accept: 'food',
    sell: 'tin',
    desc: '波斯湾的中转站，距此最近。用食物换锡——锡的唯一进口来源。',
  },
  {
    id: 'uruk',
    name: '南方城邦',
    icon: '🏛️',
    distance: 1,
    accept: 'food',
    sell: 'stone',
    desc: '两河南部的兄弟城邦。用大麦换石头——本地冲积平原缺石。',
  },
  {
    id: 'elam',
    name: '埃兰',
    icon: '⛰️',
    distance: 2,
    accept: 'wood',
    sell: 'copper',
    desc: '东部山地的埃兰人。用木材换红铜——铜的第二来源。',
  },
  {
    id: 'magan',
    name: '玛甘',
    icon: '⛵',
    distance: 3,
    accept: 'fabric',
    sell: 'copper',
    desc: '隔海相望的阿曼铜产地。用织物换铜——路途最远，代价高。',
  },
  {
    id: 'meluhha',
    name: '美鲁哈',
    icon: '🧿',
    distance: 3,
    accept: 'wood',
    sell: 'lapis',
    desc: '印度河流域的远方国度。用木材换青金石——需「青金石商路」科技解锁。',
  },
];

export const NEIGHBOR_MAP: Record<string, NeighborDef> = Object.fromEntries(
  NEIGHBORS.map(n => [n.id, n])
);

/** 声望修正：≥70 全线 −10%；≤20 全线 +25% 且 20% 概拒交易（消费方需自己处理拒绝） */
export function getReputationEffect(rep: number): { priceMul: number; refuseChance: number } {
  if (rep >= E3.REP_HIGH) return { priceMul: E3.REP_HIGH_DISCOUNT, refuseChance: 0 };
  if (rep <= E3.REP_LOW) return { priceMul: E3.REP_LOW_PENALTY, refuseChance: E3.REP_LOW_REFUSE_CHANCE };
  return { priceMul: 1, refuseChance: 0 };
}

/**
 * 货物在某条路线上的当期价格（付出货物的单价）。
 *
 * 公式：基准价 × 距离系数 × 需求冲击 × 随机波动 × 声望 × 契约锁定，
 * 再按「换算损耗」（未研究度量衡 ×1.15 的最差换算，度量衡后归零）。
 *
 * @param good      货物
 * @param distance  路线距离
 * @param jitter    随机波动 0.8–1.2（调用方提供，便于测试与价格历史记录）
 * @param repEff    声望效果
 * @param conversionLoss 换算损耗（0.15 → 度量衡 0）
 * @param contracted 是否处于契约锁定期
 */
export function getTradePrice(
  good: ResourceId,
  distance: 1 | 2 | 3,
  opts: {
    jitter: number;
    demandShock: number;
    repEff: { priceMul: number };
    conversionLoss: number;
    contracted: boolean;
    hasMetrology: boolean;
  }
): number {
  const base = (E3.BASE_PRICES as Record<string, number>)[good] ?? 1;
  const distFactor = 1 + E3.DISTANCE_COEFF * distance;
  let price = base * distFactor * opts.demandShock * opts.jitter * opts.repEff.priceMul;

  // 契约锁价：把价格拉回"无波动"的基值并 ±10%
  if (opts.contracted) {
    price = base * distFactor * opts.demandShock * E3.CONTRACT_PRICE_BAND;
    if (!opts.hasMetrology) price *= 1 / (1 - E3.CONVERSION_LOSS); // 契约仍受换算损耗
    return price;
  }

  // 换算损耗：未研究度量衡时，按贵 15% 的"黑市价"换货
  if (opts.conversionLoss > 0 && !opts.hasMetrology) {
    price *= 1 + opts.conversionLoss;
  }
  return price;
}

/** 单周期贸易结算结果（tick 用；只动铜/锡/食物/木材/石头/青金石） */
export interface TradeCycleResult {
  /** 本周期产生的资源增量（正=获得，负=付出） */
  delta: Partial<Record<ResourceId, number>>;
  /** 结算后的路线数组（cycleAccum / priceHistory 更新） */
  routes: TradeRoute[];
  /** 货品缺货警示（如想买铜但对方无货） */
  notes: string[];
}

/**
 * 结算一个商队周期（30 秒）。
 * 每条活跃路线按均分运力结算：付出 accept 货，换得 sell 货。
 * 书吏不足 → 路线效率从 1.0 向 0.3 线性下滑。
 * 青金石路线需 lapisEnabled 才生效（否则跳过）。
 */
export function settleTradeCycle(
  state: E1State,
  cycleSec: number,
  rng: () => number = Math.random,
  nowSec = Date.now() / 1000,
): TradeCycleResult {
  const eff = aggregateEffects(state);
  const merchants = state.jobs.merchant ?? 0;
  const notes: string[] = [];
  const delta: Partial<Record<ResourceId, number>> = {};
  const routes = state.tradeRoutes.map(r => ({ ...r, priceHistory: [...r.priceHistory] }));

  // 运力总额（商人 1.2/秒 × 周期秒 × 陆路运力加成）
  const totalCapacity = merchants * 1.2 * cycleSec * eff.landCaravanMul;
  const activeRoutes = routes.filter(r => !(r.supply === 'lapis' && !state.techs.lapis_route));
  if (activeRoutes.length === 0 || merchants <= 0) {
    // 无路线或无人跑商：仅推进周期计时并更新价格历史（空转）
    for (const r of routes) {
      r.cycleAccum += cycleSec;
      const jitter = E3.PRICE_JITTER_MIN + (E3.PRICE_JITTER_MAX - E3.PRICE_JITTER_MIN) * rng();
      r.priceHistory.push(round3(basePrice(r.supply) * jitter));
      if (r.priceHistory.length > E3.DEMAND_WINDOW) r.priceHistory.shift();
    }
    return { delta, routes, notes };
  }

  const capPerRoute = totalCapacity / activeRoutes.length;

  for (const r of routes) {
    r.cycleAccum += cycleSec;

    // 青金石未解锁 → 路线空转
    if (r.supply === 'lapis' && !state.techs.lapis_route) {
      r.cycleAccum = 0;
      continue;
    }

    // 书吏占用：每条路线需 SCRIBES_PER_ROUTE 书吏，不足则效率下滑
    const needScribes = eff.scribesPerRoute;
    const has = state.jobs.scribe ?? 0;
    const scribeFactor = has >= needScribes ? 1 : Math.max(0.3, 0.3 + 0.7 * (has / needScribes));

    // 契约：运力 +20%
    const contracted = r.contractUntil !== undefined && nowSec < r.contractUntil;
    const contractCapMul = contracted ? 1 + E3.CONTRACT_CAPACITY_BONUS : 1;

    // 距离系数损耗
    const distFactor = 1 + E3.DISTANCE_COEFF * r.distance;
    const effectiveCap = (capPerRoute / distFactor) * contractCapMul * scribeFactor;

    // 本期价格（付出货物 pricing）+ 需求冲击
    const jitter = E3.PRICE_JITTER_MIN + (E3.PRICE_JITTER_MAX - E3.PRICE_JITTER_MIN) * rng();
    const repEff = getReputationEffect(state.reputation);
    const demandShock = 1 + E3.DEMAND_COEFF * Math.min(1, totalBought(r));
    let pricePay = getTradePrice(r.demand, r.distance, {
      jitter,
      demandShock,
      repEff,
      conversionLoss: eff.conversionLoss,
      contracted,
      hasMetrology: eff.conversionLoss === 0,
    });
    if (r.breachPenaltyUntil !== undefined && nowSec < r.breachPenaltyUntil) {
      pricePay *= 1 + E3.BREACH_PRICE_PENALTY;
    }
    const priceGet = getTradePrice(r.supply, r.distance, {
      jitter,
      demandShock,
      repEff,
      conversionLoss: eff.conversionLoss,
      contracted,
      hasMetrology: eff.conversionLoss === 0,
    });

    // 付出货物量（按付出货单价折算运力）：effectiveCap 是本周期运力（以食物当量计）
    const available = state[r.demand] as number;
    const alreadyCommitted = delta[r.demand] ?? 0;
    const payAmount = Math.min(effectiveCap, Math.max(0, available + alreadyCommitted));
    if (payAmount <= 0) {
      if (!notes.includes('缺' + r.demand)) notes.push('缺' + r.demand);
      continue;
    }
    const getAmount = (payAmount * pricePay) / priceGet; // 换得量 = 付出食物当量 ÷ 换得单价

    // 扣付出 + 加换得（青金石路线的计入由 delta 聚合）
    delta[r.demand] = (delta[r.demand] ?? 0) - payAmount;
    delta[r.supply] = (delta[r.supply] ?? 0) + getAmount;

    // 价格历史（记录换得货的价格，供迷你折线）
    r.priceHistory.push(round3(priceGet));
    if (r.priceHistory.length > E3.DEMAND_WINDOW) r.priceHistory.shift();

    if (has < needScribes && !notes.includes('缺书吏')) notes.push('缺书吏');
  }

  return { delta, routes, notes };
}

function totalBought(r: TradeRoute): number {
  // 简化需求冲击：用近 5 周期平均价格偏离基准的程度，作为"买得多"的代理
  if (r.priceHistory.length < 2) return 0;
  const avg = r.priceHistory.reduce((a, b) => a + b, 0) / r.priceHistory.length;
  const base = basePrice(r.supply);
  return Math.max(0, (avg - base) / base);
}

function basePrice(good: ResourceId): number {
  return (E3.BASE_PRICES as Record<string, number>)[good] ?? 1;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * 当前贸易路线槽位上限。
 * = 科技聚合的 routeSlotsAdd（商队组织 +2）+ 商栈 ×2（E3.SLOTS_PER_TRADING_POST）。
 *
 * ⚠️ 死锁修复（2026-09-12）：此前 UI 只算 routeSlotsAdd、模拟器只算商栈×2，
 * 而**首座商栈的成本含青铜 60** —— 青铜必需锡、锡只能进口、进口需要商栈槽位，
 * 三者互锁导致 E3 在"商栈建成前"一条路线都开不了。商队组织科技的 +2
 * 基础槽位正是设计文档给的第一推动力（§科技表「路线数上限 +2」）。
 */
export function getRouteSlots(s: {
  techs: Record<string, boolean>;
  buildings: Record<string, number>;
}): number {
  const techSlots = s.techs['caravan_org'] ? 2 : 0;
  const postSlots = (s.buildings.trading_post ?? 0) * E3.SLOTS_PER_TRADING_POST;
  return techSlots + postSlots;
}
