// 记录系统（E3 城邦时代核心机制）
//
// 核心矛盾：研究靠「知识」，刻录占**槽位**（硬上限）且**不可撤销**。
// 口头知识 ×50% 效果，刻上泥板才 ×100% —— 这是"文明的确定性沉淀"。
//
// 槽位来源：基础 3 + 学宫×5 + 泥板制作 +2。
// 刻录开销：知识成本 ×10%。
// 刻录条件：① 有空槽 ② 知识够 ③ 至少 1 名书吏。
//
// ⚠️ 本模块只做纯计算（读 state → 返回结果），状态变更由 store 落库。

import { TECH_MAP } from '../data/techs';
import { E3 } from '../data/constants';
import type { E1State } from './engine';

/** 记录容量查询结果 */
export interface RecordCapacityInfo {
  /** 总容量 */
  cap: number;
  /** 已占用（= 已刻录科技数） */
  used: number;
  /** 剩余 */
  free: number;
}

/**
 * 记录容量 = 基础 3 + 学宫×5 + 泥板制作加成（+2）+ 档案库扩建（无直接容量）。
 * 注意：只统计**本时代**（E3）的建筑 —— 学宫是 E3 建筑，不会混入旧时代存量。
 */
export function getRecordCapacity(state: E1State): RecordCapacityInfo {
  const used = state.recorded.length;
  // recordCapacityAdd 是科技加成（泥板制作 +2），从聚合效果取
  // 为避免循环依赖，这里直接读 E3 常量 + 建筑计数 + 科技：
  //   实现上 recordCapacityAdd 在 engine.aggregateEffects 里聚合，
  //   但本模块不 import engine（循环依赖）——用最小自算：
  const academyBonus = (state.buildings.academy ?? 0) * E3.RECORD_PER_ACADEMY;
  const techBonus = state.techs.clay_tablet ? 2 : 0;
  const cap = E3.RECORD_BASE + academyBonus + techBonus;
  return { cap, used, free: Math.max(0, cap - used) };
}

/** 刻录条件检查结果 */
export interface RecordCheck {
  ok: boolean;
  reason?: string;
}

/**
 * 能否刻录某项科技。
 * ① 有空槽 ② 知识（experience 字段，E3 显示为「知识」）≥ 成本×10% ③ 至少 1 名书吏
 */
export function canRecord(techId: string, state: E1State): RecordCheck {
  const def = TECH_MAP[techId];
  if (!def) return { ok: false, reason: '未知科技' };
  if (!state.techs[techId]) return { ok: false, reason: '尚未研究，无法刻录' };
  if (state.recorded.includes(techId)) return { ok: false, reason: '已刻录（不可撤销）' };

  const { free } = getRecordCapacity(state);
  if (free <= 0) return { ok: false, reason: '槽位已满 —— 建造学宫提升记录容量' };

  const cost = Math.ceil(def.cost * 0.1);
  if (state.experience < cost) {
    return { ok: false, reason: `知识不足（刻录需 ${cost}，还差 ${Math.ceil(cost - state.experience)}）` };
  }

  if ((state.jobs.scribe ?? 0) < 1) {
    return { ok: false, reason: '需要至少 1 名书吏' };
  }

  return { ok: true };
}

/**
 * 执行刻录（纯计算，返回变更切片，由 store 落库）。
 * 扣知识 cost×10%；recorded.push(id)；recordedOnce 去重记录。
 * 不可撤销 —— 调用方必须已用 canRecord 校验。
 */
export function recordTech(
  techId: string,
  state: E1State
): { experience: number; recorded: string[]; recordedOnce: string[] } | null {
  const check = canRecord(techId, state);
  if (!check.ok) return null;

  const def = TECH_MAP[techId];
  const cost = Math.ceil(def.cost * 0.1);

  return {
    experience: state.experience - cost,
    recorded: [...state.recorded, techId],
    recordedOnce: state.recordedOnce.includes(techId)
      ? state.recordedOnce
      : [...state.recordedOnce, techId],
  };
}
