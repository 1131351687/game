# UI 更新包 V2 · 接入说明

> 面向"另一个 AI 或未来的自己"的落地文档。照做即可，不需要理解全部代码。

## 一句话说明

**当前入口已使用 `demo/src/ui/AppShellV2.tsx`；后续 UI 改动应在该基线上增量进行。**
不删除、不改动任何既有文件（包括旧的 `App.tsx` / `AppResponsiveB.tsx`）。

## 接入步骤

### 第 1 步：放文件

把 `AppShellV2.tsx` 复制到：

```
demo/src/ui/AppShellV2.tsx
```

### 第 2 步：确认入口

打开 `demo/src/main.tsx`，找到第 7 行附近：

```diff
- import App from './ui/AppResponsiveB';
+ import App from './ui/AppShellV2';
```

### 第 3 步：验证

```bash
cd demo
npx tsc --noEmit     # 必须 0 error
npm run build        # 必须成功
npm run dev          # 打开 http://localhost:5173 目视检查
```

### 回退（随时可做，零成本）

把那一行改回 `'./ui/AppResponsiveB'` 即可。旧文件从未被改动。

---

## 这个包改了什么

### ① 横屏不再把季节信息藏进抽屉 ★主要改进

**旧行为**：横屏左栏只有「时代 / 资源表 / 状态抽屉」，`SeasonBar` 与 `FireDashboard`
被塞进默认收起的「状态」抽屉。横屏本来是最不缺横向空间的形态，结果要看季节
反而得先点开抽屉 —— 信息被藏起来了。

**新行为**：
- 横屏：`FireDashboard` / `SeasonBar` 作为**常驻横条**直接挂在内容区顶部，
  季节名、当季进度条、四季条、年份、农业倍率、越冬缺口一眼可见。
- 竖屏：仍收进抽屉（屏幕窄，必须省空间），但**抽屉标题显示当季摘要**，
  收起状态不再等于信息失明。

### ② Tab 栏去重

旧版竖屏一套 `tabs` 定义 + 一套渲染，横屏又各写一遍。**改一处漏一处**就会出现
"横屏有贸易 Tab、竖屏没有"这类不一致（历史上确实发生过同类问题）。

新版：`tabs` 用 `useMemo` 算一次，`TabBar` 组件按 `variant='top' | 'bottom'`
渲染两种形态，两模式共用。

### ③ 键盘操作
- `1` `2` `3` `4` → 切换第 N 个 Tab（按当前实际解锁的 Tab 顺序）
- `Esc` → 收起竖屏状态抽屉
- 在 `input` / `textarea` 内不劫持数字键（存档导入框仍能正常打字）

### ④ 左栏可拖拽调宽（横屏）
左栏与内容区之间有一条 4px 拖拽把手，宽度范围 180–420px，存
`localStorage['civilis.railWidth']`。窄屏笔记本可以把左栏收窄给内容区。

### ⑤ 移动端适配
- 高度用 `h-[100dvh]` 而不是 `h-screen`：避开手机浏览器地址栏收起/展开
  导致的视口高度抖动（`100vh` 在移动端是"最大视口高度"，会露白或多滚动）。
- 底部 Tab 栏加 `pb-[env(safe-area-inset-bottom)]`：避开 iPhone 底部横条。

### ⑥ 无障碍
Tab 用 `role="tablist"` / `role="tab"` / `aria-selected`；
抽屉与设置按钮带 `aria-expanded`；拖拽把手为 `role="separator"`。

### ⑦ 新时代状态的双布局接入

新增时代状态（例如 E4 的秩序、覆盖率、维稳率、行政负荷和版图）必须同时接入：

- 横屏的 `StatusChips` 常驻状态条；
- 竖屏的“状态”抽屉，并复用同一个状态组件，避免两套计算口径漂移。

不要只把状态放进横屏顶部，否则移动端会出现“数据存在但玩家不可见”的功能缺口。

---

## 刻意**没有**改的东西（避免踩坑）

| 项 | 原因 |
|---|---|
| 不动 `engine.ts` / `store.ts` / `data/*` | 纯 UI 包，逻辑零风险 |
| 不动 `Icon` 组件 | 所有 emoji 一律经 `<Icon>` 渲染，「纯文字模式」开关才全局生效 |
| 不动 `drawerSummary` 之外的文案 | 文案由设计文档维护，UI 包不该顺手改 |
| 不删旧布局文件 | 保留一键回退能力 |

## 已知约束

1. **`FireDashboard` 与 `SeasonBar` 自带 `border-b` + `px-4 py-2`**
   —— 它们本来就是"常驻横条"的设计。任何地方想复用它们，**不要套带
   border/padding 的容器**，否则双边框 + 双重内边距。新版直接让它们作为
   兄弟节点堆叠，就是踩过这个坑后的写法。

2. **两个组件都自带"未开启返回 null"**
   （`FireDashboard` → 非 E1 或未研究「掌握火」；`SeasonBar` → 未开启季节循环）。
   外层**不要再加条件判断**，重复判断容易漏改（比如 E1→E2 跃迁后
   忘记同步条件，面板就永久消失了）。

3. **数字键快捷键与 Tab 数量耦合**：`tabs.length` 变多时空键自动跟随，
   超过 9 个 Tab 需要改成别的方案（当前最多 4 个，安全）。

## 验证记录

| 检查项 | 结果 |
|---|---|
| `npx tsc --noEmit` | ✅ 0 error |
| `npm run build` | ✅ 成功（300.23 kB / gzip 98.53 kB） |
| 既有逻辑改动 | 无（纯新增文件 + 入口一行） |
