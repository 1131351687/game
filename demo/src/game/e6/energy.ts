// E6 机器时代 · 能量链与电网（纯函数）
//
// 数值依据：design/game/eras/E6-machine.md §1.1/§1.2/§3.1/§3.3/§11，
// 计算口径依据 E6-devplan.md §3.2（已把 §1.2 的"链式效率"与 §3.1 的"电网 G/D"
// **统一为单一算法**，避免同一笔损耗被扣两次 —— 见 devplan 矛盾 2）。
//
// 设计意图：本代玩家优化的不是"有多少煤"，而是"每一环漏掉多少"。
// 两条路径：
//   直驱      总效率 = η₁ × η₂ × η_trans(n)，  η_trans = 1/(1 + 0.08n)
//   电气化    总效率 = η₁ × η₂ × η₃ × η₄ × η₅
//
// ⚠️ 直驱的反直觉点：η_trans 随工厂数**下降**，所以厂越多、传动轴亏得越狠
//    （瓦特 6 厂直驱 2.74% < 纽科门 1 厂 3.75%）。这是设计上刻意的：
//    逼玩家在某个时刻意识到"再堆工厂不如先修电网"。
//
// 所有函数均为纯函数，不读全局、不写 state —— tick 负责把结果落回状态。

import type { E1State } from '../engine';
import { E6 } from '../../data/constants';

/**
 * 来自 `aggregateEffects` 的 E6 效率参数。
 *
 * ⚠️ 为什么要显式传参而不是在 energy.ts 里直接调 aggregateEffects：
 *    aggregateEffects 定义在 engine.ts，而 engine.ts **import 本模块**。
 *    若本模块反向 import engine 的运行时函数，就形成循环依赖
 *    （ESM 下会在加载期抛出 undefined，且很难定位）。
 *    故本模块保持"纯函数 + 显式入参"，聚合结果由 engine 侧注入。
 *
 * 所有字段均可选，缺省即"无加成"——这样单测与 dev 脚本
 * 可以只传 state 而不用构造完整的效果对象。
 */
export interface E6EnergyEffects {
  /** η₁ 加成（焦炭冶炼 +0.045） */
  boilerEtaAdd?: number;
  /** η₂ 世代乘数（调速器/复式/表面冷凝） */
  steamGenMul?: number;
  /** 规模效应斜率加成 */
  scaleSlopeAdd?: number;
  /** 工厂产出乘数（流水线） */
  factoryOutMul?: number;
  /** 铁路收益乘数（钢轨） */
  railroadBonusMul?: number;
}

const NO_EFFECTS: Required<E6EnergyEffects> = {
  boilerEtaAdd: 0,
  steamGenMul: 1,
  scaleSlopeAdd: 0,
  factoryOutMul: 1,
  railroadBonusMul: 1,
};

function fx(e?: E6EnergyEffects): Required<E6EnergyEffects> {
  return { ...NO_EFFECTS, ...(e ?? {}) };
}

/** 能量链运行时派生值（不存档，每 tick 重算） */
export interface EnergyRuntime {
  /** 本 tick 锅炉烧煤（煤/秒） */
  coalBurned: number;
  /** 机械能毛产出（kW）：煤燃烧 × 100 × η₁ × η₂_eff */
  mechRaw: number;
  /** 送达工厂轴的可用机械能（kW） */
  mechSupply: number;
  /** 发电量（kW） */
  gridG: number;
  /** 耗电量（kW） */
  gridD: number;
  /** 供电率 ρ = min(1, G/D) */
  rho: number;
  /** 工厂机械能供给率 = min(1, mechSupply / (工厂×60)) */
  supplyRate: number;
  /** 煤 → 末端可用能 总效率（主计分板） */
  totalEta: number;
  /** 本 tick 实际烧掉的煤量（含 dt） */
  coalConsumed: number;
  /** 是否处于电气化路径（有发电厂） */
  electrified: boolean;
}

/** 空运行时（未解锁能量链 / 非 E6 时代） */
export function emptyEnergyRuntime(): EnergyRuntime {
  return {
    coalBurned: 0,
    mechRaw: 0,
    mechSupply: 0,
    gridG: 0,
    gridD: 0,
    rho: 1,
    supplyRate: 0,
    totalEta: 0,
    coalConsumed: 0,
    electrified: false,
  };
}

/**
 * 把运行时里的所有数值字段钳成**有限非负**值。
 *
 * ⚠️ 这是 NaN 的防线。E6 的公式链很长（η₁×η₂×η_trans、G/D、supply/需求…），
 *    任何一环出现 0/0 或 undefined 都会一路污染到 industrial，
 *    最终在 UI 上显示成字面的 "NaN"。实测过两次：
 *      · 未研究「纽科门机」时 η₂=0 → mechRaw=0 → 缩放比 0/0 = NaN
 *    与其在每个除法处各自小心，不如在**出口处**统一兜底。
 */
function sanitize(rt: EnergyRuntime): EnergyRuntime {
  const fin = (x: number, fallback = 0): number =>
    Number.isFinite(x) ? Math.max(0, x) : fallback;
  return {
    coalBurned: fin(rt.coalBurned),
    mechRaw: fin(rt.mechRaw),
    mechSupply: fin(rt.mechSupply),
    gridG: fin(rt.gridG),
    gridD: fin(rt.gridD),
    // rho 的兜底是 1（视为供电充足），避免因为一个 NaN 把工厂判成崩溃
    rho: Number.isFinite(rt.rho) ? Math.max(0, Math.min(1, rt.rho)) : 1,
    supplyRate: Number.isFinite(rt.supplyRate) ? Math.max(0, Math.min(1, rt.supplyRate)) : 0,
    totalEta: fin(rt.totalEta),
    coalConsumed: fin(rt.coalConsumed),
    electrified: rt.electrified,
  };
}

/**
 * η₁ 锅炉热效率：基础 0.45，「焦炭冶炼」+0.045 → 0.495。
 *
 * 用加法而非乘法：η₁ 是链条第一环，加法让面板上的数字变化一目了然
 * （45% → 49.5%），玩家能直接把科技与数字对上。
 */
export function getBoilerEta(effects?: E6EnergyEffects): number {
  const e = fx(effects);
  // ⚠️ 只从 effects 取，**不要**再查 state.techs['coke_smelting'] ——
  //    aggregateEffects 已经把该科技的 boilerEtaAdd 聚合进来了，
  //    两边都加会双重计数（0.495 变成 0.54）。
  //    这也保证了跨代衰减：aggregateEffects 走 addR(eraDecay)，
  //    E7 之后这条加成会自动变小。
  //
  // 注：本函数不再需要 state 参数（boost 全在 effects 里），
  //     但保留旧签名会误导调用方以为还有别的来源，故直接去掉。
  return E6.ETA_BOILER + e.boilerEtaAdd;
}

/**
 * η₂ 蒸汽机世代效率：取**当前最高已研究世代**。
 *
 * 世代 III 需要「分离冷凝器」（瓦特），IV 需要「高压蒸汽机」。
 * 未研究「纽科门机」时返回 0 —— 能量链根本转不起来（这是刻意的：
 * 核心科技只解锁"能用蒸汽"，世代科技才决定"用得多好"）。
 */
export function getSteamEta2(state: E1State, effects?: E6EnergyEffects): number {
  const e = fx(effects);
  let base = 0;
  if (state.techs['high_pressure']) base = E6.ETA_STEAM.IV;
  else if (state.techs['separate_condenser']) base = E6.ETA_STEAM.III;
  else if (state.techs['smeaton']) base = E6.ETA_STEAM.I5;
  else if (state.techs['newcomen']) base = E6.ETA_STEAM.I;

  if (base === 0) return 0;

  // 世代内部的微调乘数来自 aggregateEffects（调速器 1.06 / 复式 1.12 / 表面冷凝 1.08）。
  // 档位本身（I/I5/III/IV）直接查 techs —— 档位是离散的绝对设置，
  // 不适合跨代衰减成一个中间值（不存在"III.4 世代"）。
  return base * e.steamGenMul;
}

/** 当前蒸汽机世代标签（UI 用） */
export function getSteamTierLabel(state: E1State): string {
  if (state.techs['high_pressure']) return 'IV';
  if (state.techs['separate_condenser']) return 'III';
  if (state.techs['smeaton']) return 'I5';
  if (state.techs['newcomen']) return 'I';
  return '—';
}

/**
 * 当前世代所需的压力档位下限。
 *
 * ⚠️ 这是"压力表不是装饰"的机制落点：世代越高越吃压力
 *    （I 只要 1，IV 要 67）。压力掉到需求以下 → 喘振惩罚 ×0.4，
 *    相当于把玩家刚研究出来的高效率世代当场腰斩。
 */
export function getRequiredPressure(state: E1State): number {
  const tier = getSteamTierLabel(state);
  return E6.PRESSURE_REQUIRED[tier] ?? 0;
}

/**
 * 压力是否满足当前世代需求。
 * 返回 false 即触发喘振（η₂_eff = η₂ × 0.4）。
 */
export function isPressureSufficient(state: E1State): boolean {
  const required = getRequiredPressure(state);
  if (required <= 0) return true;
  return (state.steamPressure ?? 0) >= required;
}

/** η₂ 的有效值（含喘振惩罚） */
export function getSteamEta2Effective(state: E1State, effects?: E6EnergyEffects): number {
  const eta2 = getSteamEta2(state, effects);
  return isPressureSufficient(state) ? eta2 : eta2 * E6.SURGE_PENALTY;
}

/**
 * η₄ 输电效率：取当前最高已研究输电方案的档位。
 *
 * ⚠️ 未研究任何输电时返回 1（而非 0）—— 这是刻意的：发电厂本身
 *    在「电磁感应」后就解锁了，但**没有输电线路时电网立不起来**，
 *    表现是 η₄=1 却因发电机 η₃ 与电动机 η₅ 的连乘而收益微薄，
 *    玩家自然会去点直流输电。若这里返回 0 会造成"发电厂建成却产出恒为 0"
 *    的暴死体验，违反 devplan §3.1「平滑可感知而非突然暴死」的设计原则。
 */
export function getTransmitEta4(state: E1State): number {
  if (state.techs['hvac_transmission']) return E6.ETA_TRANSMIT.hvac;
  if (state.techs['ac_transmission']) return E6.ETA_TRANSMIT.ac;
  if (state.techs['dc_transmission']) return E6.ETA_TRANSMIT.dc;
  return 1;
}

/** 当前输电档位标签（UI 用） */
export function getTransmitLabel(state: E1State): string {
  if (state.techs['hvac_transmission']) return '高压交流';
  if (state.techs['ac_transmission']) return '交流';
  if (state.techs['dc_transmission']) return '直流';
  return '未建设';
}

/**
 * 电工对输电损耗的补偿。
 *
 * 每名电工 −1.5%，上限 −30%。乘法作用于 η₄ 的**损耗部分**而非 η₄ 本身：
 *   η₄_eff = 1 − (1 − η₄) × (1 − 电工减免)
 * 这样 η₄=0.94 时不会因为电工而突破 1.0（效率不可能超过 100%）。
 */
export function getElectricianEtaBonus(state: E1State): number {
  const n = state.jobs.electrician ?? 0;
  return Math.min(0.3, n * 0.015);
}

/** η₄ 的有效值（含电工补偿） */
export function getTransmitEta4Effective(state: E1State): number {
  const eta4 = getTransmitEta4(state);
  const relief = getElectricianEtaBonus(state);
  if (relief <= 0) return eta4;
  return 1 - (1 - eta4) * (1 - relief);
}

/**
 * 本 tick 的烧煤量（煤/秒）。
 *
 * = min(煤库存, 司炉工 × 5)
 *
 * 两个上限同时存在是有意的：司炉工不够时**烧不动**（压力也会掉），
 * 煤不够时**没得烧**。UI 需要能区分这两种"熄火"——前者派司炉工，
 * 后者扩煤矿，是完全不同的处置。
 *
 * ⚠️ 刻意**不**在这里对压力封顶做短路（不在本函数判断 pressure >= cap）。
 *    原因：本函数是"锅炉能吃多少煤"的**能力**描述，与当前压力无关；
 *    压力封顶的处置属于 tickSteam 的职责。若在这里短路，
 *    压力满时 calcSupply 会认为"毛机械能为 0"，电网瞬间崩塌 ——
 *    那是比浪费煤严重得多的错误（玩家会看到"压力一满工厂就停"）。
 */
export function getCoalBurned(state: E1State): number {
  const stokers = state.jobs.stoker ?? 0;
  const capacityByLabor = stokers * E6.STOKER_COAL_PER_SEC;
  return Math.min(state.coal ?? 0, capacityByLabor);
}

/**
 * 锅炉实际**需要**的煤量（经济上限，而非能力上限）。
 *
 * 与 getCoalBurned 的区别（这是 E6 配平的关键）：
 *   getCoalBurned = 司炉工最多能烧多少（能力）
 *   getCoalDemand = 当前工业规模**需要**烧多少（需求）
 *
 * ⚠️ 为什么必须有这个区分：压力封顶（cap）之后继续满负荷烧煤，
 *    煤会被**白白烧光**，炼钢永远分不到煤 → 钢恒为 0 → 15 座工厂
 *    与 200k 钢的跃迁条件永远无法满足。
 *    e6-autoplay 实测正是这个症状：煤在 0 与 10000 之间振荡、钢始终 0。
 *
 * ⚠️ 需求必须按**工厂的机械能负载**来定，不能只按"维持压力"来定。
 *    第一版只算了维持压力的衰减补偿（≈0.42 煤/秒），结果引擎只有
 *    4 kW 机械能，连一座工厂的 60 kW 都带不动，工业品恒为 5 上下。
 *    正确口径：需求 = 全部工厂满负荷所需机械能 ÷ (100 × η₁ × η₂)
 *    即"要喂饱这些工厂，得烧多少煤"。再加上维持压力那部分。
 */
export function getCoalDemand(
  state: E1State,
  effects?: E6EnergyEffects
): number {
  const boilers = state.buildings.boiler_house ?? 0;
  const decayRate = E6.PRESSURE_DECAY * Math.max(0, 1 - E6.PRESSURE_BOILER_RELIEF * boilers);
  // 1) 维持压力所需
  const pressureUpkeep = (decayRate / 3) * 1.2;
  // 压力已满时可以只留少量维持；未满时需要更多
  const cap = E6.PRESSURE_CAP_BASE + boilers * E6.PRESSURE_CAP_PER_BOILER;
  const atCap = (state.steamPressure ?? 0) >= cap - 0.5;

  // 2) 工业负载所需：全部工厂满负荷的机械能 → 折回煤
  const factories = state.buildings.factory ?? 0;
  const needKW = factories * E6.FACTORY_MECH_KW;
  const eta1 = getBoilerEta(effects);
  const eta2 = getSteamEta2Effective(state, effects);
  // 电气化时发电厂还要额外吃机械能（G = mechRaw × η₃ × η₄）
  const plants = state.buildings.power_plant ?? 0;
  const plantKW = plants * E6.POWER_PLANT_KW;
  const chainEta = eta1 * eta2;
  const industryNeed = chainEta > 0 ? (needKW + plantKW) / (E6.COAL_KW_PER_UNIT * chainEta) : 0;

  // 压力已满时不需要额外升压，只保留维持量
  const base = atCap ? pressureUpkeep : Math.max(pressureUpkeep, pressureUpkeep * 3);
  return base + industryNeed;
}

/** 直驱传动效率 η_trans = 1 / (1 + 0.08 × 工厂数) */
export function getTransmitEfficiency(n: number): number {
  return 1 / (1 + E6.LINE_SHAFT_FRICTION * n);
}

/** 机械能毛产出（kW）：煤燃烧 × 100 kW·秒 × η₁ × η₂_eff */
export function calcMechanicalRaw(state: E1State, effects?: E6EnergyEffects): number {
  const coalBurned = getCoalBurned(state);
  const eta1 = getBoilerEta(effects);
  const eta2 = getSteamEta2Effective(state, effects);
  return coalBurned * E6.COAL_KW_PER_UNIT * eta1 * eta2;
}

/**
 * 求解本 tick 的能量链状态（本代核心函数）。
 *
 * 电气化路径的算法要点（devplan §3.2 的"为什么不双重惩罚"）：
 *   G = mechRaw × η₃ × η₄     —— 发电侧，已经把"煤→电"的全部损耗算进去了
 *   mechSupply = G × η₅        —— 再补电动机损耗，得到工厂轴端可用的机械能
 *   supplyRate = mechSupply / (工厂×60)  —— 工厂产能的**唯一**节流源
 *   ρ 只作为"电网健康度"输出给 UI 与拉闸惩罚，**不与 supplyRate 重复相乘**
 * 直驱路径无电网：ρ 恒为 1，G/D 为 0，工厂只受 η_trans 约束。
 */
export function calcSupply(state: E1State, effects?: E6EnergyEffects): EnergyRuntime {
  const n = state.buildings.factory ?? 0;
  const plants = state.buildings.power_plant ?? 0;
  const housing = state.buildings.worker_housing ?? 0;
  const boilers = state.buildings.boiler_house ?? 0;

  const coalBurned = getCoalBurned(state);
  const eta1 = getBoilerEta(effects);
  const eta2 = getSteamEta2Effective(state, effects);
  const mechRaw = coalBurned * E6.COAL_KW_PER_UNIT * eta1 * eta2;

  if (plants > 0) {
    // ── 电气化路径 ──
    const eta4 = getTransmitEta4Effective(state);
    const G = mechRaw * E6.ETA_GENERATOR * eta4;
    const D =
      n * E6.FACTORY_ELEC_KW +
      housing * E6.HOUSING_ELEC_KW +
      boilers * E6.BOILER_ELEC_KW;
    const rho = D > 0 ? Math.min(1, G / D) : 1;
    const mechSupply = G * E6.ETA_MOTOR;
    const supplyRate = n > 0 ? Math.min(1, mechSupply / (n * E6.FACTORY_MECH_KW)) : 0;
    const totalEta = eta1 * eta2 * E6.ETA_GENERATOR * eta4 * E6.ETA_MOTOR;
    return sanitize({
      coalBurned,
      mechRaw,
      mechSupply,
      gridG: G,
      gridD: D,
      rho,
      supplyRate,
      totalEta,
      coalConsumed: coalBurned,
      electrified: true,
    });
  }

  // ── 直驱路径 ──
  const etaTrans = getTransmitEfficiency(n);
  const mechSupply = mechRaw * etaTrans;
  const supplyRate = n > 0 ? Math.min(1, mechSupply / (n * E6.FACTORY_MECH_KW)) : 0;
  const totalEta = eta1 * eta2 * etaTrans;
  return sanitize({
    coalBurned,
    mechRaw,
    mechSupply,
    gridG: 0,
    gridD: 0,
    rho: 1,
    supplyRate,
    totalEta,
    coalConsumed: coalBurned,
    electrified: false,
  });
}

/** 电网惩罚：ρ 阈值 → 产出乘数 + 是否拉闸/崩溃（devplan §3.2.1） */
export function applyGridThrottle(rho: number): {
  outputMul: number;
  brownout: boolean;
  blackout: boolean;
} {
  if (rho >= E6.RHO_FULL) return { outputMul: 1, brownout: false, blackout: false };
  if (rho >= E6.RHO_BROWNOUT)
    return { outputMul: rho, brownout: false, blackout: false };
  if (rho >= E6.RHO_BLACKOUT)
    return { outputMul: rho, brownout: true, blackout: false };
  return { outputMul: E6.RHO_COLLAPSE_OUTPUT, brownout: true, blackout: true };
}

/**
 * 工厂规模系数 = 1 + 斜率 × min(座数, 15)。
 *
 * 15 座之后不再增益 —— 这是设计上的"规模墙"：继续堆厂只增加能耗，
 * 不再提升单位产出，逼玩家转向效率科技。
 */
export function getScaleCoef(state: E1State, effects?: E6EnergyEffects): number {
  const e = fx(effects);
  const n = state.buildings.factory ?? 0;
  // 斜率基数 + 科技加成（全部经 aggregateEffects 的 eraDecay 处理）
  const slope = E6.SCALE_SLOPE + e.scaleSlopeAdd;
  return 1 + slope * Math.min(n, E6.SCALE_MAX_FACTORIES);
}

/**
 * 工厂工业品产出（/秒）。
 *
 * = 6 × 规模系数 × 供给率 × 科技乘数 × ρ惩罚（电气模式）
 *
 * ⚠️ 机械师**不**出现在这个公式里 —— 他的产出完全由能量决定（T2.3）。
 *    机械能不足时多派机械师是纯浪费，这是本代最重要的反直觉教学点。
 */
export function calcFactoryOutput(state: E1State, effects?: E6EnergyEffects): number {
  const e = fx(effects);
  const n = state.buildings.factory ?? 0;
  if (n === 0) return 0;

  const rt = calcSupply(state, effects);
  const scale = getScaleCoef(state, effects);
  const throttle = applyGridThrottle(rt.rho);

  let out = E6.FACTORY_BASE_OUTPUT * scale * rt.supplyRate;
  out *= e.factoryOutMul;
  if (rt.electrified) out *= throttle.outputMul;

  return out;
}

/**
 * 由**已算好的**运行时求工厂产出。
 *
 * 供 engine.tick 使用：tick 里已经按"实际烧煤量"修正过 EnergyRuntime
 * （锅炉按需求取煤，避免压力封顶后白白烧煤），若此处再调 calcFactoryOutput
 * 会用**未修正**的供给率重算一遍，导致账目不一致。
 * 因此拆出这个纯函数，让 tick 传入自己修正后的 runtime。
 */
export function calcFactoryOutputFromRuntime(
  state: E1State,
  rt: EnergyRuntime,
  effects?: E6EnergyEffects
): number {
  const e = fx(effects);
  const n = state.buildings.factory ?? 0;
  if (n === 0) return 0;

  const scale = getScaleCoef(state, effects);
  const throttle = applyGridThrottle(rt.rho);

  let out = E6.FACTORY_BASE_OUTPUT * scale * rt.supplyRate;
  out *= e.factoryOutMul;
  if (rt.electrified) out *= throttle.outputMul;
  return out;
}

/**
 * 能量链总览（供 UI 面板使用），把每一环的 η 都摊开。
 *
 * 面板要回答玩家一个问题：「损耗在哪一环？」
 * 因此这里返回的是**分环效率**，而不是一个笼统的总效率。
 */
export interface EnergyChainView {
  /** 各环效率（0–1） */
  etaBoiler: number;
  etaSteam: number;
  etaTransmit: number;
  etaMotor: number;
  etaGenerator: number;
  /** 直驱传动效率（仅直驱路径有意义） */
  etaLineShaft: number;
  /** 两条路径的总效率，供面板对比 */
  totalEtaDirect: number;
  totalEtaElectric: number;
  /** 当前实际生效的总效率 */
  totalEtaActive: number;
  runtime: EnergyRuntime;
  scaleCoef: number;
  factoryOutput: number;
  /** 压力是否满足世代需求（false = 喘振中） */
  pressureOk: boolean;
  requiredPressure: number;
  steamTier: string;
  transmitLabel: string;
}

export function getEnergyChainView(state: E1State, effects?: E6EnergyEffects): EnergyChainView {
  const n = state.buildings.factory ?? 0;
  const eta1 = getBoilerEta(effects);
  const eta2 = getSteamEta2Effective(state, effects);
  const eta4 = getTransmitEta4Effective(state);
  const etaTrans = getTransmitEfficiency(n);
  const rt = calcSupply(state, effects);

  return {
    etaBoiler: eta1,
    etaSteam: eta2,
    etaTransmit: eta4,
    etaMotor: E6.ETA_MOTOR,
    etaGenerator: E6.ETA_GENERATOR,
    etaLineShaft: etaTrans,
    totalEtaDirect: eta1 * eta2 * etaTrans,
    totalEtaElectric: eta1 * eta2 * E6.ETA_GENERATOR * eta4 * E6.ETA_MOTOR,
    totalEtaActive: rt.totalEta,
    runtime: rt,
    scaleCoef: getScaleCoef(state, effects),
    factoryOutput: calcFactoryOutput(state, effects),
    pressureOk: isPressureSufficient(state),
    requiredPressure: getRequiredPressure(state),
    steamTier: getSteamTierLabel(state),
    transmitLabel: getTransmitLabel(state),
  };
}

/** 压力上限 = 100 + 20 × 锅炉房数 */
export function getPressureCap(state: E1State): number {
  const boilers = state.buildings.boiler_house ?? 0;
  return E6.PRESSURE_CAP_BASE + boilers * E6.PRESSURE_CAP_PER_BOILER;
}

/**
 * 蒸汽压力推进（T2.4）。
 *
 * 上升侧：司炉工烧煤即升压，升幅与烧煤量成正比。
 * 下降侧：自然衰减 1.5/s × (1 − 0.15×锅炉房数)，锅炉房越多越"保温"。
 *
 * ⚠️ 这里刻意不设"压力上限即停烧"的短路 —— 烧煤照烧、压力封顶，
 *    让玩家先看到"煤在白白烧掉"再去派更多人，比悄悄停烧更有教学效果。
 */
export function tickSteam(
  pressure: number,
  state: E1State,
  dt: number
): { pressure: number; gained: number; lost: number } {
  const cap = getPressureCap(state);
  const boilers = state.buildings.boiler_house ?? 0;
  const coalBurned = getCoalBurned(state);

  // 升压：每烧 1 煤/秒 得 3 点/秒 压力（司炉工满负荷时 ≈ 每 5 煤升 15 点）
  const rise = coalBurned * 3 * dt;
  // 衰减：锅炉房减缓
  const decayRate = E6.PRESSURE_DECAY * (1 - E6.PRESSURE_BOILER_RELIEF * boilers);
  const fall = Math.max(0, decayRate) * dt;

  let next = pressure + rise - fall;
  if (next < 0) next = 0;
  if (next > cap) next = cap;

  return { pressure: next, gained: rise, lost: fall };
}

/** 压力档位信息（UI 用） */
export function getPressureTier(pressure: number): {
  key: 'idle' | 'low' | 'normal' | 'high';
  label: string;
  color: string;
} {
  if (pressure <= 0) return { key: 'idle', label: '静止', color: '#6b7280' };
  if (pressure <= E6.PRESSURE_TIERS.low)
    return { key: 'low', label: '微压', color: '#b45309' };
  if (pressure <= E6.PRESSURE_TIERS.normal)
    return { key: 'normal', label: '常压', color: '#f97316' };
  return { key: 'high', label: '高压', color: '#fbbf24' };
}
