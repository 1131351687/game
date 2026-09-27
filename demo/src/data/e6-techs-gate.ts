import type { TechDef } from './techs';

/**
 * E6 门槛科技：**电力**（发电机与输配电网）。
 *
 * 它推开 E7 电气时代——注意它与支撑科技「电磁感应·发电机」的分工：
 *   支撑「电磁感应」解决的是"电能不能造出来"（解锁发电厂 + η₃）；
 *   门槛「电力」解决的是"电能能不能变成一套**网**"（输配、调度、覆盖）。
 * 故门槛的要求是「电磁感应 + 至少一条输电线路」——有了网，才谈得上 E7 的主干电网。
 */
export const E6_TECHS_GATE: TechDef[] = [
  {
    id: 'electric_power', name: '电力', short: '电力', icon: '⚡', branch: 'gate', era: 'E6', cost: 3000000, type: 'gate',
    requires: ['electromagnetic_induction'],
    requiresAny: ['dc_transmission', 'ac_transmission'],
    effects: {},
    position: { x: 0, y: 10 },
    desc: '发电机 + 输配电网：电不再是厂区里的实验，而是一张覆盖全城的网。通往 E7 电气时代的门。',
  },
];
