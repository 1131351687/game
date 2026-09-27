import type { TechDef } from './techs';

/**
 * E5 核心、支撑与门槛。
 *
 * 核心科技是**印刷术**——E5 的一切都建立在"信息可以被复制"之上。
 * 复利机制只在印刷术点完之后才真正启动：学者产出的研究点本身不加速，
 * 加速来自「本时代已解锁科技数 N」带来的 k × N_eff 倍率。
 *
 * 支撑 5 项是唯一允许昂贵的中枢节点：它们各自打开一条支路
 * （纸 / 活字 / 大学 / 航海 / 火药），并且前四项里有三项直接给 k 加值。
 *
 * 门槛科技蒸汽机要求 3,000,000 研究点——它靠的是忍耐期之后的复利爆发，
 * 而不是靠堆学者。这正是 E5 的核心矛盾在数值上的落点。
 */
export const E5_TECHS_CORE: TechDef[] = [
  // ── 核心 ──
  {
    id: 'printing', name: '印刷术', short: '印刷', icon: '📖', branch: 'core', era: 'E5', cost: 600, type: 'unlock',
    requires: ['unification'],
    effects: { compoundKAdd: 0.05, unlockJobs: ['printer', 'scholar'], unlockBuildings: ['printing_workshop', 'library'] },
    position: { x: 0, y: 0 },
    desc: '把文字从"手抄"变成"复制"。研究速度从此随已解锁科技数复利增长——这是本代唯一的增长引擎。',
  },

  // ── 支撑 5：各开一条支路 ──
  {
    id: 'papermaking', name: '造纸术', short: '造纸', icon: '📜', branch: 'printing', era: 'E5', cost: 1200, type: 'unlock',
    requires: ['printing'],
    effects: { unlockJobs: ['papermaker'], unlockBuildings: ['paper_mill'], paperOutputMul: 1.2 },
    position: { x: -2, y: 1 },
    desc: '破布与树皮打成浆——纸张不再是稀缺品，印刷链的第一环才立得住。',
  },
  {
    id: 'movable_type', name: '金属活字', short: '活字', icon: '🔤', branch: 'printing', era: 'E5', cost: 2500, type: 'qualitative',
    requires: ['printing'],
    effects: { compoundKAdd: 0.01, printOutputMul: 1.15 },
    position: { x: -2, y: 2 },
    desc: '单字可拆可排可复用。排字速度翻倍，且**复利系数 k +0.01**——这是知识开始自我加速的第一步。',
  },
  {
    id: 'university_system', name: '大学制度', short: '大学', icon: '🎓', branch: 'printing', era: 'E5', cost: 5000, type: 'unlock',
    requires: ['printing'],
    effects: { compoundKAdd: 0.01, unlockJobs: ['teacher'], unlockBuildings: ['university'], literacyCapAdd: 0.15 },
    position: { x: -2, y: 3 },
    desc: '把学者固定在一处、把教学变成制度。**k +0.01**，识字率上限 +15%。',
  },
  {
    id: 'compass', name: '指南针', short: '指南针', icon: '🧭', branch: 'navigation', era: 'E5', cost: 9000, type: 'unlock',
    requires: ['printing'],
    effects: { enableVoyage: true, unlockJobs: ['sailor'], unlockBuildings: ['harbor'], voyageBonus: 0.05 },
    position: { x: 1, y: 1 },
    desc: '不再沿岸摸索。**远航系统由此解锁**——白银、异域物产与新大陆都在这扇门后面。',
  },
  {
    id: 'gunpowder', name: '火药', short: '火药', icon: '💥', branch: 'science', era: 'E5', cost: 16000, type: 'qualitative',
    requires: ['printing'],
    effects: { expansionCostMul: 0.85, legionPowerMul: 1.25 },
    position: { x: 3, y: 1 },
    desc: '硝石、硫磺与木炭。旧时代的城墙与甲胄从此不再算数。',
  },

  // ── 门槛 ──
  {
    id: 'steam_engine', name: '蒸汽机', short: '蒸汽', icon: '⚙️', branch: 'gate', era: 'E5', cost: 3000000, type: 'gate',
    requires: ['printing'],
    requiresAny: ['university_system', 'gunpowder'],
    effects: {},
    position: { x: 0, y: 10 },
    desc: '把火从"取暖与冶炼"变成"做功"。通往 E6 工业时代的门——它要的不是更多学者，而是忍耐期熬出来的复利。',
  },
];
