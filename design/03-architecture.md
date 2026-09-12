# 03 · 架构设计

## 1. 架构目标

Civilis 是单机、纯前端、长时间运行的放置游戏。架构优先保证以下性质：

1. 模拟核心可脱离 React 和浏览器运行，便于自动试玩、离线收益、回放和测试。
2. 玩法规则可复现，随机结果由存档中的随机源决定，而不是直接调用 Math.random。
3. 状态变化有单一入口，UI 不直接改状态，玩法层不依赖 Zustand。
4. 存档格式可演进，每个版本都有明确的迁移和校验。
5. 新内容优先通过数据表扩展，只有真正新增机制时才增加代码系统。

这是一份面向当前项目的渐进式架构。不要为了完整架构一次性引入所有未来模块。

## 2. 分层与依赖方向

    React UI
       ↓ commands / selectors
    State adapter (Zustand)
       ↓ calls
    Simulation facade
       ↓
    Pure game systems + data definitions
       ↓
    Core services (clock / save / rng / format)

推荐依赖方向：

    ui → state → game → data
                  ↘ core
    core 不依赖 ui、state、game
    data 不依赖 ui、state、game

### 2.1 data：定义，不计算

存放资源、岗位、建筑、科技、时代、事件等静态定义。数据表可以引用 ID，但不应调用 Store 或产生副作用。

### 2.2 game：规则和模拟

存放纯函数、命令和模拟系统。它只接收状态、命令、时间和服务接口，返回新状态与结构化事件。禁止导入 React、Zustand、localStorage 和 DOM API。

### 2.3 state：应用状态适配器

Zustand 只负责保存当前状态、向 UI 提供 selector，以及把 UI 命令转交给 game 层。它不应成为玩法规则的唯一存放位置。

### 2.4 core：可替换基础设施

提供时钟、存档仓库、序列化、迁移、随机源和数字格式化。业务层依赖接口，不依赖具体的 localStorage 或 Worker 实现。

### 2.5 ui：展示与交互

UI 读取 selector，提交命令，展示 GameEvent。UI 不负责计算资源产出，不直接调用 setState。

## 3. 推荐目录

    src/
    ├── core/
    │   ├── clock/
    │   │   ├── worker.ts             # Worker 定时器
    │   │   └── gameClock.ts          # elapsed time 调度
    │   ├── save/
    │   │   ├── repository.ts         # 存档读写接口
    │   │   ├── localStorageRepo.ts   # 当前实现
    │   │   ├── migrations.ts         # 版本迁移
    │   │   └── codec.ts              # 序列化与校验
    │   ├── rng/
    │   │   ├── types.ts
    │   │   └── seeded.ts
    │   └── format/
    ├── data/                         # 纯定义
    ├── game/
    │   ├── model/
    │   │   ├── state.ts              # GameState / Snapshot
    │   │   └── events.ts             # GameEvent
    │   ├── systems/
    │   │   ├── production.ts
    │   │   ├── population.ts
    │   │   ├── jobs.ts
    │   │   ├── buildings.ts
    │   │   ├── technology.ts
    │   │   ├── trade.ts
    │   │   └── transition.ts
    │   ├── commands/
    │   │   ├── researchTech.ts
    │   │   ├── build.ts
    │   │   └── advanceEra.ts
    │   └── simulation/
    │       ├── simulate.ts            # 统一模拟入口
    │       └── offline.ts
    ├── state/
    │   ├── store.ts
    │   ├── selectors.ts
    │   └── adapter.ts
    └── ui/

当前项目可以继续使用 demo/src/game/engine.ts 和 demo/src/state/store.ts，但新增系统应按上述边界实现；拆分旧文件时保持行为不变。

当前迁移状态：

- 已完成 game/simulation/simulate.ts，在线单步和离线结算共用模拟入口。
- 已完成 game/systems/population.ts，人口离散增长从总引擎中抽出。
- 贸易规则已位于 game/trade.ts，总引擎只负责在周期到达时编排结算。
- GameEvent 已作为模拟结果的一部分返回；后续继续把时代、科技和建筑消息迁移为结构化事件。

## 4. 状态、命令和事件

### 4.1 GameState 是唯一模拟输入

    export interface GameState {
      era: EraId;
      food: number;
      population: number;
      jobs: Record<JobId, number>;
      buildings: Record<BuildingId, number>;
      techs: Record<TechId, boolean>;
      rng: RngState;
      stats: GameStats;
    }

游戏层不得原地修改输入对象。所有修改都返回新的切片或新的状态。

### 4.2 命令表达玩家意图

    type GameCommand =
      | { type: 'job.set'; jobId: JobId; count: number }
      | { type: 'building.buy'; buildingId: BuildingId }
      | { type: 'tech.research'; techId: TechId }
      | { type: 'era.advance' };

命令处理器负责校验条件、计算结果和生成事件。UI 只提交命令，不重复实现校验。

### 4.3 事件是规则层与 UI 层的边界

    type GameEvent =
      | { type: 'tech.completed'; techId: TechId }
      | { type: 'building.completed'; buildingId: BuildingId }
      | { type: 'era.advanced'; from: EraId; to: EraId }
      | { type: 'action.rejected'; action: string; reason: string };

游戏层返回事件 ID 和参数，不拼接中文 UI 文案。消息组件负责本地化和展示。

## 5. 统一数据流

    用户操作
      ↓
    state.dispatch(command)
      ↓
    game command handler
      ↓
    { state, events }
      ↓
    Zustand 更新
      ↓
    UI selector 重绘

时钟和离线收益也必须进入同一个模拟入口：

    Worker / 页面恢复 / 离线结算
      ↓ elapsed seconds
    simulate(state, options)
      ↓
    GameState + GameEvent[]

这样在线、加速和离线模式使用同一套规则，只改变时间步长和效率参数。

## 6. 纯函数和服务边界

    export interface SimulationContext {
      rng: RandomSource;
      mode: 'online' | 'offline' | 'test';
    }

    export interface RandomSource {
      next(): number;
      pick<T>(items: readonly T[]): T;
    }

规则：

- 不在 game 中调用 Math.random。
- 不在 game 中调用 localStorage。
- 不在 game 中调用 useStore.getState。
- 不修改传入的 GameState、数组或嵌套对象。
- 结果中明确返回资源变化、状态变化和事件。

## 7. 主循环

时钟只报告经过的真实时间，游戏模拟负责限制步长和补算量。不要把玩法正确性绑定到 250ms 的 tick 计数。

    export function advanceBy(elapsedSec: number): SimulationResult {
      const capped = Math.min(elapsedSec, MAX_CATCH_UP_SEC);
      let remaining = capped;
      let state = currentState;
      const events: GameEvent[] = [];

      while (remaining > 0) {
        const dt = Math.min(remaining, MAX_STEP_SEC);
        const result = simulateStep(state, dt, context);
        state = result.state;
        events.push(...result.events);
        remaining -= dt;
      }

      return { state, events };
    }

250ms / 1s / 5s 仍可作为性能调度策略，但不是业务层的状态模型。

## 8. 渐进式迁移

1. 先为现有 engine.tick、transition、trade 增加纯函数测试。
2. 把 Math.random 替换为注入的 RandomSource。
3. 从 engine.ts 拆出贸易、人口、生产和时代跃迁系统。
4. 把 store.ts 中的研究、建造、跃迁逻辑迁移为 command handler。
5. 引入 GameEvent，将中文文案移到 UI presenter。
6. 将时钟、离线收益和存档拆为独立适配器。

每一步都应保持现有 demo 可运行，不进行一次性大重构。

## 9. 架构验收标准

- game 可以在没有 React、Zustand、DOM 的环境中执行。
- 同一个初始状态、时间和 RNG 种子得到相同结果。
- 在线和离线模拟使用同一个 simulate 入口。
- 存档损坏或字段缺失时不会让应用崩溃。
- UI 组件不出现 store.setState。
- 每个新增系统至少有规则测试和一个跨系统集成测试。

---

*返回 [README](./README.md)*
