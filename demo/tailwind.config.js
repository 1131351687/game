/**
 * Tailwind 配置
 *
 * ─────────────────────────────────────────────
 * 主题方案：把色阶与字体映射到 CSS 变量
 * ─────────────────────────────────────────────
 *
 * 组件里已经写了 500+ 处 `bg-gray-800` / `text-gray-500` / `font-mono` 之类的
 * className，而且是**深色优先**（gray-900 = 页面底、gray-100 = 主文字）。
 *
 * 与其把它们全改写成 `bg-surface` 这类语义类名（改动面大、容易漏），
 * 不如让 token 本身指向 CSS 变量：
 *   · 夜间（默认）= 暖石色阶，与改造前结构一致但色相转暖
 *   · 日间 = 同一批变量换一套值
 *   · 强调色（余烬橙）同样变量化，两套主题各自调到合适的对比度
 * 这样"日间/夜间"只需切 root 上的 data-theme，组件一行不用动。
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
        /**
         * 品牌强调色：余烬橙。
         * 纪律：单屏只出现一处，只给"当前焦点"（活动 Tab、进度条、跃迁按钮）。
         * 不要拿它去涂普通按钮——那会让界面变成一片橙色。
         */
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          strong: 'rgb(var(--accent-strong) / <alpha-value>)',
        },
        /**
         * 语义色：给状态用（正向 / 提醒 / 危险）。
         * 与品牌色分工明确——它们表达"发生了什么"，不表达"这是我们的品牌"。
         */
        ok: 'rgb(var(--ok) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        /**
         * blue 只在一处出现（活动 Tab 曾用 bg-blue-600），那是典型的
         * "默认值残留"，统一收编到强调色。这里只补项目真正用到的三档，
         * 不覆盖整个家族（覆盖会连带删掉其他档位）。
         */
        blue: {
          300: 'rgb(var(--accent-strong) / <alpha-value>)',
          400: 'rgb(var(--accent-strong) / <alpha-value>)',
          600: 'rgb(var(--accent) / <alpha-value>)',
        },
      },
      fontFamily: {
        /* 正文：黑体，密度高、小字号耐看 */
        sans: ['Noto Sans SC', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'sans-serif'],
        /* 展示字：宋体，碑刻/史书感，只给标题与时代名用 */
        display: ['Noto Serif SC', 'Songti SC', 'SimSun', 'serif'],
        /* 数字：等宽对齐，像考古记录里的测量值 */
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
