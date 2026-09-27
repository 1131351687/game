/**
 * E6 机器时代可玩性推演（T5.1 验收脚本）
 *
 * 目的：证明 E6 不只是"编译通过"，而是**真的能从开局走到跃迁**。
 *
 * 本脚本刻意**不用** store（那是 React 层），而是直接驱动 game/engine 的纯函数，
 * 因此它能暴露引擎层的真实瓶颈。E5 的 autoplay 正是靠这一点抓出了
 * "航海港白银死锁"与"K 断崖"两个真问题。
 *
 * 推演策略（按能量链的物理顺序，不是按成本顺序）：
 *   1. 煤矿 → 煤矿工（否则一切无从谈起）
 *   2. 锅炉房 → 司炉工（压力上限与升压）
 *   3. 蒸汽机 → 机械能
 *   4. 工厂（先直驱，接受 η_trans 随厂数下降）
 *   5. 贝塞麦 → 炼钢（但要给锅炉留煤）
 *   6. 电磁感应 → 发电厂 + 输电 → 摆脱传动轴瓶颈
 *   7. 治理科技（公共卫生法 / 排水）→ 解开死亡螺旋
 *   8. 电力（门槛）
 *
 * 性能：STEP = 5s（决策频率），E6 的 agent 函数较重（aggregateEffects 遍历全库）。
 * 用法（tsx 缺失时）：
 *   node .\node_modules\typescript\bin\tsc --outDir <tmp> --module commonjs \
 *        --target es2020 --moduleResolution node --skipLibCheck --esModuleInterop \
 *        src\dev\e6-autoplay.ts
 *   node <tmp>\dev\e6-autoplay.js
 */
import {
  tick,
  canResearch,
  isTechAvailable,
  canAffordBuilding,
  getBuildingCost,
  isBuildingUnlocked,
  checkAdvance,
  aggregateEffects,
} from '../game/engine';
import type { E1State } from '../game/engine';
import { TECHS, techsOfEra } from '../data/techs';
import { JOBS } from '../data/jobs';
import { calcSupply, calcFactoryOutput, getScaleCoef } from '../game/e6/energy';
import { getUrbanizationRate, getGrowthDiagnosis } from '../game/e6/urban';

const STEP = 5;
const HARD_CAP = 120000; // 20 万秒硬上限

/**
 * 研究顺序：按依赖图拓扑排，**核心科技必须第一个**。
 *
 * ⚠️ 踩过的坑：最初把 coal_mining 排在第一位，结果整个 E6 一步不动 ——
 *    因为 coal_mining 的 requires 是 steam_engine_industry（核心科技）。
 *    脚本对"暂不可研究"的科技是静默跳过的，于是每轮都跳过全部科技，
 *    推演跑 30000 秒科技数停在 0/24。
 *    教训：autoplay 的科技顺序必须尊重 requires，否则失败是静默的。
 *    （也可考虑让脚本在"全部跳过"时报警，见下方 autoResearch 的警告。）
 */
const TECH_ORDER = [
  // 0) 核心科技：一切的前提（也是 coal_mining 的前置）
  'steam_engine_industry',
  // 1) 起步：煤与蒸汽
  'coal_mining', 'newcomen', 'coke_smelting',
  // 2) 效率：世代与调速
  'smeaton', 'governor', 'separate_condenser',
  // 3) 规模化
  'standardized_parts', 'reciprocating_engine', 'bessemer',
  // 4) 电气化（关键转折：摆脱 η_trans）
  'electromagnetic_induction', 'dc_transmission', 'ac_transmission',
  'high_pressure', 'compound_expansion',
  // 5) 治理（解开死亡螺旋）
  'public_health_act', 'sewer_system',
  // 6) 提升末端效率
  'surface_condenser', 'assembly_line', 'hvac_transmission',
  // 7) 铁路与彩蛋
  'railroad', 'steel_rail', 'analytical_engine',
  // 8) 门槛
  'electric_power',
];

function makeE6State(): E1State {
  const techs: Record<string, boolean> = {};
  // 前五个时代全部科技视为已研究（模拟"从 E1 一路玩到 E6"）
  for (const t of TECHS) if (t.era !== 'E6') techs[t.id] = true;

  const jobs: Record<string, number> = {};
  for (const j of JOBS) jobs[j.id] = 0;

  const buildings: Record<string, number> = {};
  for (const b of ['house', 'field', 'granary', 'academy', 'city_house']) buildings[b] = 0;
  buildings.house = 20;
  // ⚠️ 田地必须给足：农夫产出受 min(1, 农夫数/(田数×3)) 限制，
  //    360 农夫配 40 田地只有 120 人有效，食物会瞬间见底
  //    （首轮推演就这么把 3000 人饿到 2165）。
  //    E6 人口规模比前代大得多，田地基数必须同步放大。
  //    1200 田地可容 3600 农夫全效。
  buildings.field = 1200;
  buildings.granary = 40;
  buildings.city_house = 40;
  buildings.academy = 10;

  return {
    era: 'E6',
    food: 200000, wood: 200000, stone: 200000, experience: 0,
    livestock: 0, fabric: 0, eraElapsedSec: 0,
    population: 1200, populationProgress: 0, fire: 50,
    copper: 0, tin: 0, bronze: 0, lapis: 0, iron: 100000, coin: 500000,
    territory: 30, legions: 0, expansionPending: null,
    p1Unlocked: true, legacyPoints: 0,
    recorded: [], recordedOnce: [], tradeRoutes: [], reputation: 50,
    jobs, buildings, techs, autoMaintainFire: true,
    // E5 遗产
    paper: 0, books: 0, silver: 0, researchPoints: 0, exoticGoods: 0,
    literacy: 60, voyages: [], loan: 0,
    // E6
    coal: 0, steel: 0, electricity: 0, industrial: 0,
    steamPressure: 0, pollution: 0, urbanizationRate: 0, railroadLevel: 0,
  } as unknown as E1State;
}

function main(): void {
  const s = makeE6State();
  const bag = s as unknown as Record<string, number>;
  const e6Techs = techsOfEra('E6');

  let t = 0;
  let advanceAt = -1;
  let firstCoalAt = -1;
  let firstSteelAt = -1;
  let firstFactoryAt = -1;
  let firstGridAt = -1;
  let peakIndustrial = 0;
  let peakEta = 0;
  let peakPopulation = 0;
  let peakRho = 0;
  let minPopulation = Infinity;
  let starveSec = 0;
  /** 研究停滞计时与其原因（防静默失败，见 autoResearch） */
  let researchStallSec = 0;
  let stallReason = '';

  const countE6 = (): number => e6Techs.filter(x => s.techs[x.id]).length;

  const fx = () => {
    const eff = aggregateEffects(s);
    return {
      boilerEtaAdd: eff.boilerEtaAdd,
      steamGenMul: eff.steamGenMul,
      scaleSlopeAdd: eff.scaleSlopeAdd,
      factoryOutMul: eff.factoryOutMul,
      railroadBonusMul: eff.railroadBonusMul,
    };
  };

  const tryBuild = (id: string): boolean => {
    if (!isBuildingUnlocked(id as never, s)) return false;
    if (!canAffordBuilding(id as never, s)) return false;
    const cost = getBuildingCost(id as never, s);
    for (const [res, amount] of Object.entries(cost)) {
      const owned = bag[res];
      if (typeof owned === 'number') bag[res] = owned - (amount as number);
    }
    s.buildings[id] = (s.buildings[id] ?? 0) + 1;
    return true;
  };

  /**
   * 建造优先级。
   *
   * ⚠️ 顺序即"能量链的物理顺序"，不能按成本排：
   *    先有煤矿才有煤，先有锅炉房才压得住压力，
   *    先有蒸汽机才有机械能，工厂才不是空壳。
   *    若先堆工厂（成本最低），会产出恒为 0 的工业品，
   *    autoplay 会卡死在"有厂无电"状态 —— 这正是要验证的失败模式。
   */
  const autoBuild = (): void => {
    const mines = s.buildings.coal_mine ?? 0;
    const boilers = s.buildings.boiler_house ?? 0;
    const engines = s.buildings.steam_engine_house ?? 0;
    const factories = s.buildings.factory ?? 0;
    const plants = s.buildings.power_plant ?? 0;
    const housing = s.buildings.worker_housing ?? 0;
    const pop = Math.floor(s.population);

    // 1) 田地与粮仓：人口规模大，食物必须先稳住（否则一切归零）
    //
    // ⚠️ 但要设**上限**：田地/粮仓只吃木石（便宜），可它们的目标随人口
    //    水涨船高，会无限占用每一次决策机会，把工业建造饿死。
    //    人口在 E6 会稳定在 4000 一带，故田地上限取 2000 座、粮仓 60 座足够。
    const fields = s.buildings.field ?? 0;
    const popNow = Math.floor(s.population);
    const targetFields = Math.min(2000, Math.ceil((popNow / 3) * 1.2));
    if (fields < targetFields && tryBuild('field')) return;
    if ((s.buildings.granary ?? 0) < 60 && tryBuild('granary')) return;

    // ⚠️ 后面的顺序里每一项都必须用 `if (tryBuild(x)) return;` 形式**依次尝试**，
    //    不能写成「目标未达成就 return」——因为成本按 costMultiplier=1.35
    //    逐座递增，第 10 座煤矿要 15,603 工业品，而第 2 座工厂只要 2,619。
    //    若写成 `if (mines < 8) { if (tryBuild('coal_mine')) return; return; }`
    //    就会在煤矿买不起时**卡死整条建造链**，
    //    实测表现为工厂停在 1 座、发电厂永远建不出来。
    //    正确做法：买不起就往下试更便宜的目标。
    const order: Array<[string, number]> = [
      // [建筑 id, 目标数量]
      //
      // ⚠️ 目标数量必须**保守**。成本按 1.35^已有座数 增长，
      //    第 13 座工厂要 71k 工业品、第 15 座要 130k，
      //    而同样被指数放大的第 14 座煤矿也要 15k+。
      //    若把煤矿/电厂目标定得过高，它们会持续吃掉全部工业品，
      //    工厂永远攒不够 15 座（实测停在 13/15，就差这一项没通关）。
      //    所以这里对"辅助建筑"设硬上限，让工厂优先拿到工业品。
      ['coal_mine', mines < 3 ? 3 : mines < 8 ? 8 : 10],
      ['boiler_house', boilers < 2 ? 2 : 5],
      ['worker_housing', Math.max(4, Math.floor(popNow / 150))],
      ['steam_engine_house', engines < 3 ? 3 : 8],
      // 工厂优先于电厂扩产：15 座是跃迁硬条件，电厂只需够满足 ρ ≥ 0.9
      ['factory', factories < 5 ? 5 : 15],
      ['power_plant', plants < 4 ? 4 : 8],
    ];
    for (const [id, target] of order) {
      const have = s.buildings[id] ?? 0;
      if (have >= target) continue;
      if (tryBuild(id)) return;
    }
  };

  /**
   * 岗位分配：按能量链的瓶颈动态调整。
   *
   * ⚠️ 第一条铁律：**先保证食物为正**。E6 人口规模大（数千），
   *    农夫产出受 min(1, 农夫/(田数×3)) 限制，一旦农夫不够或田地不足，
   *    食物会以 600/s 的速度倒扣（首轮推演 3000 人 5 秒掉到 2165）。
   *    所以这里先解出"需要多少农夫才能覆盖消耗"，再把余量分给工业岗位。
   */
  const autoAssign = (): void => {
    const pop = Math.floor(s.population);
    const next: Record<string, number> = {};
    for (const j of JOBS) next[j.id] = 0;

    const fields = s.buildings.field ?? 0;
    // 每块田最多 3 名有效农夫；农夫产出受田地效率限制
    const maxEffectiveFarmers = fields * 3;
    // 每人每秒消耗 0.2 食物（E6 沿用），留 30% 安全边际
    const needFood = pop * 0.2 * 1.3;
    // 农夫单产：按引擎口径取 E6 的实际值（≈0.8/s/人，受季节与田地效率影响）
    const perFarmer = 0.8;
    let farmers = Math.min(pop, Math.ceil(needFood / perFarmer));
    // 不能超过田地的有效容量（超了也是白派）
    farmers = Math.max(farmers, Math.min(pop, Math.ceil(maxEffectiveFarmers * 0.5)));
    farmers = Math.min(farmers, pop);
    next.farmer = farmers;
    next.gatherer = 0;
    let remaining = pop - farmers;

    // 煤矿工：目标 35% 人口（煤是 E6 的血液）
    const miners = Math.min(remaining, Math.ceil(pop * 0.35));
    next.coal_miner = miners;
    remaining -= miners;

    // 司炉工：要能把压力顶过世代需求
    const stokers = Math.min(remaining, Math.ceil(pop * 0.12));
    next.stoker = stokers;
    remaining -= stokers;

    // 炼钢工：只在煤有余量时派人（否则会抢锅炉的煤）
    const coalSlack = (s.coal ?? 0) > 2000;
    if (s.techs['bessemer'] && coalSlack) {
      const steelworkers = Math.min(remaining, Math.ceil(pop * 0.12));
      next.steelworker = steelworkers;
      remaining -= steelworkers;
    }

    // 机械师：**不带来产出**，保持 0（验证 T2.3 的"多派无用"）
    next.machinist = 0;

    // 电工：有电网后派一些补偿输电损耗
    if ((s.buildings.power_plant ?? 0) > 0) {
      const electricians = Math.min(remaining, Math.ceil(pop * 0.06));
      next.electrician = electricians;
      remaining -= electricians;
    }

    // 余下的人给伐木/采石（保证木材石料不断）
    const rest = Math.max(0, remaining);
    next.woodcutter = Math.floor(rest * 0.6);
    next.quarryman = Math.floor(rest * 0.4);

    // 按人口上限裁剪
    let assigned = 0;
    for (const j of JOBS) {
      const want = next[j.id] ?? 0;
      const keep = Math.min(want, Math.max(0, pop - assigned));
      next[j.id] = keep;
      assigned += keep;
    }
    s.jobs = next as never;
  };

  const autoResearch = (): void => {
    let blockedByAvailability = 0;
    let blockedByCost = 0;
    for (const id of TECH_ORDER) {
      if (s.techs[id]) continue;
      if (!isTechAvailable(id as never, s)) {
        blockedByAvailability++;
        continue;
      }
      if (!canResearch(id as never, s)) continue;
      const def = TECHS.find(x => x.id === id);
      if (!def) continue;
      if (s.experience < def.cost) {
        blockedByCost++;
        continue;
      }
      s.experience -= def.cost;
      s.techs[id] = true;
      return;
    }
    // ⚠️ 静默失败防护：若"有经验、但所有科技都因前置不可研究"，
    //    说明 TECH_ORDER 与 requires 图不一致（曾因 coal_mining 排在
    //    steam_engine_industry 之前而整局卡死 30000 秒，科技停在 0/24）。
    //    这里记录一次，循环结束后打印，避免同类问题再次静默。
    if (blockedByAvailability > 0 && blockedByCost === 0) {
      researchStallSec += STEP;
      if (researchStallSec === STEP) {
        const firstBlocked = TECH_ORDER.find(
          id => !s.techs[id] && !isTechAvailable(id as never, s)
        );
        const def = TECHS.find(x => x.id === firstBlocked);
        stallReason =
          `全部剩余科技均因前置不可研究（首个：${firstBlocked}，` +
          `requires=${JSON.stringify(def?.requires ?? [])}）—— TECH_ORDER 顺序与依赖图不符`;
      }
    }
  };

  const log: string[] = [];
  let stepCount = 0;

  while (t < HARD_CAP) {
    const r = tick(s, STEP, () => 0.5);
    Object.assign(s, r as never);
    t += STEP;
    stepCount++;

    // 记录里程碑
    if (firstCoalAt < 0 && (s.coal ?? 0) > 100) firstCoalAt = t;
    if (firstSteelAt < 0 && (s.steel ?? 0) > 10) firstSteelAt = t;
    if (firstFactoryAt < 0 && (s.buildings.factory ?? 0) > 0) firstFactoryAt = t;
    if (firstGridAt < 0 && (s.buildings.power_plant ?? 0) > 0) firstGridAt = t;

    peakIndustrial = Math.max(peakIndustrial, s.industrial ?? 0);
    peakPopulation = Math.max(peakPopulation, s.population);
    minPopulation = Math.min(minPopulation, s.population);
    const rt = calcSupply(s, fx());
    peakEta = Math.max(peakEta, rt.totalEta);
    peakRho = Math.max(peakRho, rt.rho);

    if (s.population < 10) starveSec += STEP;

    // 每 5 步（25s）决策一次
    if (stepCount % 5 === 0) {
      autoAssign();
      autoBuild();
      autoResearch();
    }

    // 每 100 步（500s）输出一次进度
    if (stepCount % 100 === 0) {
      const diag = getGrowthDiagnosis(s, {
        pollutionReduce: aggregateEffects(s).pollutionReduce,
        crowdingReduce: aggregateEffects(s).crowdingReduce,
      });
      log.push(
        `t=${String(t).padStart(6)}s 煤=${String(Math.floor(s.coal ?? 0)).padStart(7)} ` +
          `钢=${String(Math.floor(s.steel ?? 0)).padStart(6)} ` +
          `工业=${String(Math.floor(s.industrial ?? 0)).padStart(9)} ` +
          `厂=${String(s.buildings.factory ?? 0).padStart(2)} ` +
          `电=${String(s.buildings.power_plant ?? 0).padStart(2)} ` +
          `人口=${String(Math.floor(s.population)).padStart(4)} ` +
          `P=${String(Math.floor(s.steamPressure ?? 0)).padStart(3)} ` +
          `η=${(rt.totalEta * 100).toFixed(2)}% ` +
          `ρ=${(rt.rho * 100).toFixed(0)}% ` +
          `污=${Math.floor(s.pollution ?? 0)} ` +
          `U=${(getUrbanizationRate(s) * 100).toFixed(0)}% ` +
          `拥挤=${diag.crowding.toFixed(2)} 卫生=${diag.sanitation.toFixed(2)} ` +
          `科技=${countE6()}/${e6Techs.length}`
      );
    }

    const check = checkAdvance(s);
    if (check.ok) {
      advanceAt = t;
      break;
    }
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log(' E6 机器时代 · 可玩性推演');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\n── 里程碑 ──');
  console.log(`  首批煤      : ${firstCoalAt >= 0 ? firstCoalAt + 's' : '未达成'}`);
  console.log(`  首批钢      : ${firstSteelAt >= 0 ? firstSteelAt + 's' : '未达成'}`);
  console.log(`  首座工厂    : ${firstFactoryAt >= 0 ? firstFactoryAt + 's' : '未达成'}`);
  console.log(`  首座发电厂  : ${firstGridAt >= 0 ? firstGridAt + 's' : '未达成'}`);
  console.log(`\n── 峰值 ──`);
  console.log(`  总效率 η    : ${(peakEta * 100).toFixed(3)}%`);
  console.log(`  供电率 ρ    : ${(peakRho * 100).toFixed(0)}%`);
  console.log(`  工业品      : ${Math.floor(peakIndustrial)}`);
  console.log(`  人口 峰/谷  : ${Math.floor(peakPopulation)} / ${Math.floor(minPopulation)}`);
  console.log(`  科技        : ${countE6()} / ${e6Techs.length}`);

  console.log('\n── 推演日志（每 500s）──');
  for (const l of log) console.log('  ' + l);

  console.log('\n── 跃迁判定 ──');
  if (advanceAt >= 0) {
    console.log(`  ✅ E6 通关，耗时 ${advanceAt}s（${(advanceAt / 3600).toFixed(1)} 小时游戏内）`);
  } else {
    const check = checkAdvance(s);
    console.log('  ❌ 未在硬上限内通关。当前条件：');
    for (const it of check.items) {
      console.log(`     [${it.done ? '✓' : ' '}] ${it.label}  (${it.detail})`);
    }
  }
  console.log(`\n  饥饿秒数（人口 < 10）: ${starveSec}s`);
  if (researchStallSec > 0) {
    console.log(`  ⚠️  研究停滞 ${researchStallSec}s：${stallReason}`);
  }
  console.log(`  最终工厂产出: ${calcFactoryOutput(s, fx()).toFixed(1)} 工业品/秒`);
  console.log(`  规模系数: ×${getScaleCoef(s, fx()).toFixed(2)}`);
}

main();
