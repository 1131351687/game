/**
 * Tailwind 配置
 *
 * ─────────────────────────────────────────────
 * 主题方案：把 gray 色阶映射到 CSS 变量
 * ─────────────────────────────────────────────
 *
 * 组件里已经写了 500+ 处 `bg-gray-800` / `text-gray-500` 之类的 className，
 * 而且是**深色优先**（gray-900 = 页面底、gray-100 = 主文字）。
 *
 * 与其把每一处都改写成 `bg-surface` 这类语义类名（改动面大、容易漏），
 * 不如让 `gray-N` 本身指向 `--gray-N` 变量：
 *   · 夜间（默认）= Tailwind 原生灰阶，渲染结果与改造前**完全一致**
 *   · 日间 = 同一批变量换一套值（整体反相）
 * 这样"日间/夜间"只需切换 root 上的 data-theme，组件一行不用动。
 *
 * `<alpha-value>` 是必需的：项目里大量使用 `bg-gray-800/40` 这类透明度写法，
 * 不写它 Tailwind 无法生成 `/40` 的变体。
 *
 * 少数"同一个 token 承担两种语义"的地方（如 gray-800 既是卡片底色又是边框色），
 * 在 styles.css 里为浅色主题单独覆盖。
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gray: Object.fromEntries(
          [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map(s => [
            s,
            `rgb(var(--gray-${s}) / <alpha-value>)`,
          ])
        ),
      },
    },
  },
  plugins: [],
};
