---
version: alpha
name: Vercel-Inspired-design-analysis
description: An inspired interpretation of Vercel's design language — a developer-platform brand whose surface is a stark black-and-ink duet on near-white canvas, broken at hero scale by a multi-color mesh gradient (cyan / blue / magenta / amber) that acts as the entire decorative system, paired with a custom geometric sans for headlines and a monospaced caption face for technical labels.

colors:
  primary: "#171717"
  on-primary: "#ffffff"
  ink: "#171717"
  body: "#4d4d4d"
  mute: "#888888"
  hairline: "#ebebeb"
  hairline-strong: "#a1a1a1"
  canvas: "#ffffff"
  canvas-soft: "#fafafa"
  canvas-soft-2: "#f5f5f5"
  link: "#0070f3"
  link-deep: "#0761d1"
  link-bg-soft: "#d3e5ff"
  success: "#0070f3"
  error: "#ee0000"
  error-soft: "#f7d4d6"
  error-deep: "#c50000"
  warning: "#f5a623"
  warning-soft: "#ffefcf"
  warning-deep: "#ab570a"
  violet: "#7928ca"
  violet-soft: "#d8ccf1"
  violet-deep: "#4c2889"
  cyan: "#50e3c2"
  cyan-soft: "#aaffec"
  cyan-deep: "#29bc9b"
  highlight-pink: "#ff0080"
  highlight-magenta: "#eb367f"
  gradient-develop-start: "#007cf0"
  gradient-develop-end: "#00dfd8"
  gradient-preview-start: "#7928ca"
  gradient-preview-end: "#ff0080"
  gradient-ship-start: "#ff4d4d"
  gradient-ship-end: "#f9cb28"
  selection-bg: "#171717"
  selection-fg: "#f2f2f2"

typography:
  display-xl:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 48px
    fontWeight: 600
    lineHeight: 48px
    letterSpacing: -2.4px
  display-lg:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 32px
    fontWeight: 600
    lineHeight: 40px
    letterSpacing: -1.28px
  display-md:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
    letterSpacing: -0.96px
  display-sm:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 20px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: -0.6px
  body-lg:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 18px
    fontWeight: 400
    lineHeight: 28px
    letterSpacing: 0px
  body-md:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  body-md-strong:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 16px
    fontWeight: 500
    lineHeight: 24px
  body-sm:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: -0.28px
  body-sm-strong:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: -0.28px
  caption:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  caption-mono:
    fontFamily: Geist Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, monospace
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  code:
    fontFamily: Geist Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, monospace
    fontSize: 13px
    fontWeight: 400
    lineHeight: 20px
  button-md:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
  button-lg:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 16px
    fontWeight: 500
    lineHeight: 24px

rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  pill-sm: 64px
  pill: 100px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 40px
  3xl: 48px
  4xl: 64px
  5xl: 96px
  6xl: 128px
  section: 192px

components:
  nav-bar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    height: 64px
    padding: "{spacing.sm} {spacing.lg}"
  nav-link:
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs} {spacing.sm}"
  nav-cta-signup:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-sm-strong}"
    rounded: "{rounded.sm}"
    padding: "0px {spacing.xs}"
    height: 28px
  nav-cta-login:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm-strong}"
    rounded: "{rounded.sm}"
    padding: "0px {spacing.xs}"
    height: 28px
  nav-cta-ask-ai:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-sm-strong}"
    rounded: "{rounded.sm}"
    padding: "0px {spacing.xs}"
    height: 28px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-lg}"
    rounded: "{rounded.pill}"
    padding: "0px {spacing.sm}"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.button-lg}"
    rounded: "{rounded.pill}"
    padding: "0px {spacing.sm}"
  button-primary-sm:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: "0px {spacing.xs}"
  button-secondary-sm:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: "0px {spacing.xs}"
  tab-ghost:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill-sm}"
    padding: "0px {spacing.md}"
  icon-button-circular:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.full}"
  card-marketing:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  card-marketing-large:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  card-soft:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  template-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  code-editor-mockup:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  form-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "0px {spacing.sm}"
    height: 40px
  form-input-sm:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "0px {spacing.sm}"
    height: 32px
  form-input-lg:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "0px {spacing.sm}"
    height: 48px
  badge-secondary:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.body}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "0px {spacing.xs}"
  pricing-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  pricing-card-featured:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  logo-strip:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
    padding: "{spacing.lg} {spacing.xl}"
  hero-band:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-xl}"
    padding: "{spacing.4xl} {spacing.lg}"
  feature-mesh-band:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-lg}"
    padding: "{spacing.5xl} {spacing.lg}"
  showcase-band-light:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.display-lg}"
    padding: "{spacing.5xl} {spacing.lg}"
  showcase-band-dark:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.display-lg}"
    padding: "{spacing.5xl} {spacing.lg}"
  footer:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
    padding: "{spacing.4xl} {spacing.lg}"
  link-inline:
    textColor: "{colors.link}"
    typography: "{typography.body-md}"
  banner-marketing:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs} {spacing.sm}"

  # ─── Examples (illustrative) — auto-derived; resolve any TO_FILL markers below ───
  ex-pricing-tier:
    description: "Default tier card. Mirrors pricing-card chrome on canvas-soft surface with a hairline border."
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  ex-pricing-tier-featured:
    description: "Featured tier — polarity-flipped to ink primary with white text and white CTA."
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  ex-product-selector:
    description: "What's Included summary card — repurposed for the brand's GPU / inference / Pro feature tiers."
    backgroundColor: "{colors.canvas-soft}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  ex-cart-drawer:
    description: "Subscription summary — line items per add-on (NOT a literal e-commerce cart)."
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
    item-divider: "{colors.hairline}"
  ex-app-shell-row:
    description: "Sidebar nav row. Active state uses brand primary as a left-edge indicator bar."
    backgroundColor: "{colors.canvas}"
    activeIndicator: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs} {spacing.sm}"
  ex-data-table-cell:
    description: "Mirrors the brand's table chrome. Header uses caption-mono uppercase mono; body uses body-sm."
    headerBackground: "{colors.canvas-soft}"
    headerTypography: "{typography.caption-mono}"
    bodyTypography: "{typography.body-sm}"
    cellPadding: "{spacing.xs} {spacing.sm}"
    rowBorder: "{colors.hairline}"
  ex-auth-form-card:
    description: "Sign-in / sign-up card. Mirrors card-marketing-large chrome with form-input primitives inside."
    backgroundColor: "{colors.canvas-soft}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  ex-modal-card:
    description: "Modal dialog surface — same chrome as card-marketing-large with Level 5 modal shadow."
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  ex-empty-state-card:
    description: "Empty-state illustration frame. Generous padding on canvas-soft."
    backgroundColor: "{colors.canvas-soft}"
    rounded: "{rounded.lg}"
    padding: "{spacing.3xl}"
    captionTypography: "{typography.body-md}"
  ex-toast:
    description: "Toast notification surface — flat-cornered card-marketing chrome with Level 4 shadow."
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
    typography: "{typography.body-sm}"
---

[English](./DESIGN.md) | 中文

## Overview

Vercel 是一个开发者平台品牌——这个页面是部署仪表盘的营销门面，写给早已熟悉语法的工程师。它凭 Web 上最干净利落的素净体系之一赢得这种姿态：近乎纯白的 `{colors.canvas-soft}` 页面背景、近黑的墨色 `{colors.ink}` 文本，以及一套 200 级步进的灰阶，让每一条分隔线、每一个边框、每一个禁用态都有各自审慎的一级。该品牌在营销尺度上引入色彩的唯一位置，是多停靠点的网格渐变（`{colors.gradient-develop-start}` → `{colors.gradient-preview-end}` → `{colors.gradient-ship-start}` → 青色 / 品红 / 琥珀），它漂浮在氛围化的背景里，从不被缩小成一块色板。这个渐变就是全部的装饰体系。

字体是第二位决定性的声音。品牌自有的定制几何无衬线体（Geist）承载展示、正文、按钮——一切叙事性的内容——展示用 600 字重，按钮用 500，正文用 400。配套的等宽字体（Geist Mono）承载技术性标签：终端示意、代码块，有时还有文件名说明。标题采用句首大写，并配以激进的负字距（48 px 的 hero 上为 `-2.4px`）——该品牌从不使用正字距，也绝不在 mono 标签之外使用全大写。

表面采用四级阶梯：`{colors.canvas}`（卡片用的纯白）、`{colors.canvas-soft}` 98%（页面主体）、`{colors.canvas-soft-2}` 95%（偶尔出现的内嵌区域）、`{colors.primary}`（近黑的深墨色，当某个区块需要暗色模式处理时用作极性翻转的深色带）。阴影极其克制——每张抬升的卡片都带有一层叠加阴影，由 `0px 1px 1px #00000005` + `0px 2px 2px #0000000a` + 一圈内嵌边框构成。卡片从不漂浮在厚重的投影上；它们落在页面上，由 hairline 细线 + 柔和光晕托住。

**关键特征：**

- 单一的黑墨色主 CTA `{colors.primary}` 承载每一个转化目标，并为次要操作搭配白底白面的 `button-secondary`。品牌为营销 CTA 使用 100 px 胶囊造型，为应用内导航按钮使用紧凑的 6 px 方角造型。
- 多停靠点的网格渐变（青-蓝-品红-琥珀）是唯一的装饰性外框——用于 hero 尺度和特性区块的氛围背景。它就是这个品牌。
- 每个区块的眉题和小标签都使用等宽字体 `{typography.caption-mono}` 或 `{typography.code}`；其余一切都用几何无衬线体。
- 微妙的叠加阴影式悬浮层级——多层小偏移叠加，黑色不透明度 4-12%——从不使用单一的重投影。
- 一套完整的 100–1000 灰阶 + 蓝色 + 红色 + 琥珀 + 绿色 + 蓝绿 + 紫色 + 粉色的色阶以系统 token 集的形式存在，但营销表面只使用 `100`、`1000` 和 `700` 级的色调；其余留在设计系统 token 中，供产品内表面使用。
- 一种 “Active CPU” 式的定价节奏：`pricing-card` 在定价页三列排布，`pricing-card-featured`（Pro 档位）极性翻转为 `{colors.primary}`，与白卡片的兄弟卡形成对照。

## Colors

### 品牌与强调色

- **墨色（Ink）**（`{colors.primary}` — `#171717`）：唯一的主 CTA 颜色。接近纯黑的墨色，承载每一个 Sign Up 胶囊、每一个页脚 CTA，以及深色带的极性翻转。在整个页面的浅色表面上用作文本颜色。（解析自 `--ds-gray-1000`。）
- **青色（Cyan）**（`{colors.cyan}` — `#50e3c2`）：标志性的薄荷青，用于品牌渐变和 Geist 系统的 spotlight token。在 hero 渐变的停靠点中可见。
- **高亮粉（Highlight Pink）**（`{colors.highlight-pink}` — `#ff0080`）：品牌的高亮品红，用作 preview 渐变对中高饱和度的停靠点。
- **紫色（Violet）**（`{colors.violet}` — `#7928ca`）：深紫色，用作 preview 渐变的起点，也出现在开发者控制台的高亮里。
- **链接蓝（Link Blue）**（`{colors.link}` — `#0070f3`）：品牌的主链接色，也是遗留的 `--geist-success` 语义色。

### 表面

- **画布（Canvas）**（`{colors.canvas}` — `#ffffff`）：纯白的卡片 / 对话框 / 弹层表面。
- **柔画布（Canvas Soft）**（`{colors.canvas-soft}` — `#fafafa`）：默认页面背景——98% 白。几乎所有区块都落在这个色调上。
- **柔画布 2（Canvas Soft 2）**（`{colors.canvas-soft-2}` — `#f5f5f5`）：略深一层的内嵌表面，用于“代码编辑器内部背景”、template-card 悬停态和下拉菜单。
- **发丝线（Hairline）**（`{colors.hairline}` — `#ebebeb`）：1 px 分隔线——表格行、卡片边框、输入框边框。
- **强发丝线（Hairline Strong）**（`{colors.hairline-strong}` — `#a1a1a1`）：500 级的灰，在浅色带上用作略强的分隔线，也用作弱化文本色。

### 文本

- **墨色（Ink）**（`{colors.ink}` — `#171717`）：浅色表面上的一切标题和正文段落。
- **正文色（Body）**（`{colors.body}` — `#4d4d4d`）：次级文本——副标题、正文说明、导航链接非激活态文本、页脚栏目正文。
- **弱化色（Mute）**（`{colors.mute}` — `#888888`）：优先级最低的文本——占位符文本、小字说明、低调标签。
- **主色上的前景（On Primary）**（`{colors.on-primary}` — `#ffffff`）：`{colors.primary}` 表面上的所有文本。

### 语义色

- **成功 / 链接（Success / Link）**（`{colors.success}` — `#0070f3`）：品牌遗留的成功指示色，兼任主链接色。为正文内链提供悬停时可见的下划线。
- **深链接（Link Deep）**（`{colors.link-deep}` — `#0761d1`）：内链的按下 / 已访问色调。
- **柔链接底（Link Bg Soft）**（`{colors.link-bg-soft}` — `#d3e5ff`）：柔和的粉彩蓝填充，用于“what's new”胶囊横幅和信息类徽章。
- **错误（Error）**（`{colors.error}` — `#ee0000`）：用于破坏性操作和表单错误的校验红。
- **柔错误（Error Soft）**（`{colors.error-soft}` — `#f7d4d6`）：用于破坏性状态背景的柔和粉彩红。
- **深错误（Error Deep）**（`{colors.error-deep}` — `#c50000`）：按下 / 深层的破坏性状态。
- **警告（Warning）**（`{colors.warning}` — `#f5a623`）：注意 / 等待状态指示色。
- **柔警告（Warning Soft）**（`{colors.warning-soft}` — `#ffefcf`）/ **深警告（Warning Deep）**（`{colors.warning-deep}` — `#ab570a`）：背景 + 按下两个变体。

### 品牌渐变

品牌的标志性装饰是一个三对渐变的叠加：

- **Develop**（`{colors.gradient-develop-start}` `#007cf0` → `{colors.gradient-develop-end}` `#00dfd8`）——蓝到蓝绿的一对，用来标记 “deploy” / “develop” 的节奏。
- **Preview**（`{colors.gradient-preview-start}` `#7928ca` → `{colors.gradient-preview-end}` `#ff0080`）——紫到粉的一对，用于 “preview” 表面。
- **Ship**（`{colors.gradient-ship-start}` `#ff4d4d` → `{colors.gradient-ship-end}` `#f9cb28`）——珊瑚到琥珀的一对，用于 “ship” 表面。

在用作 hero 氛围背景时，这三对渐变会合并为一个多色网格渐变。请把渐变当作一个统一的整体——不要裁剪成单一颜色，不要调换停靠点顺序，也不要把它缩小。仅在 hero 尺度使用。

## Typography

### 字体家族

两款定制字体承载整个系统：

1. **一款定制几何无衬线体**（提取为 `Geist`），用于所有展示、正文、按钮、链接和标签。400 / 500 / 600 三个字重是工作集；该字体绝不以 700 或更重的字重出现。展示尺寸使用激进的负字距（48 px hero 上 `-2.4 px`，32 px 区块标题上 `-1.28 px`）；正文保持中性或轻微负字距。
2. **一款定制等宽字体**（提取为 `Geist Mono`），用于终端示意、代码块和小型 mono 说明标签——一切想要传达“技术感”的东西。仅在 12-13 px 上使用 400 字重。字距中性。

一款窄体展示无衬线体（`Space Grotesk`）作为第三款字体加载，用于偶发的编辑性场合，但在捕获到的任何表面上都没有作为主字体渲染。

### 层级

| Token                         | 字号 | 字重 | 行高 | 字距    | 用途                                                                            |
| ----------------------------- | ---- | ---- | ---- | ------- | ------------------------------------------------------------------------------- |
| `{typography.display-xl}`     | 48px | 600  | 48px | -2.4px  | Hero 大标题（“Build and deploy on the AI Cloud.”）。                            |
| `{typography.display-lg}`     | 32px | 600  | 40px | -1.28px | 区块标题（“Your frontend, delivered.”、“A compute model for all workloads.”）。 |
| `{typography.display-md}`     | 24px | 600  | 32px | -0.96px | 卡片组标题、定价档位名称。                                                      |
| `{typography.display-sm}`     | 20px | 600  | 28px | -0.6px  | 行内展示型微标题。                                                              |
| `{typography.body-lg}`        | 18px | 400  | 28px | 0       | 区块标题下的导语段落。                                                          |
| `{typography.body-md}`        | 16px | 400  | 24px | 0       | 默认正文段落。                                                                  |
| `{typography.body-md-strong}` | 16px | 500  | 24px | 0       | 加粗的行内正文。                                                                |
| `{typography.body-sm}`        | 14px | 400  | 20px | -0.28px | 次级正文、导航链接文本、button-md 标签。                                        |
| `{typography.body-sm-strong}` | 14px | 500  | 20px | -0.28px | 导航 CTA 标签、表格行强调。                                                     |
| `{typography.caption}`        | 12px | 400  | 16px | 0       | 页脚次级行、徽章标签。                                                          |
| `{typography.caption-mono}`   | 12px | 400  | 16px | 0       | 想要技术语气的区块眉题和标签说明。                                              |
| `{typography.code}`           | 13px | 400  | 20px | 0       | 行内代码、终端示意、命令片段。                                                  |
| `{typography.button-md}`      | 14px | 500  | 20px | 0       | 小型 / 导航尺度按钮标签。                                                       |
| `{typography.button-lg}`      | 16px | 500  | 24px | 0       | 营销尺度胶囊按钮标签。                                                          |

### 原则

- **负字距是品牌声音的一部分。** 展示尺寸使用 `-2.4` 到 `-0.6` px 的激进字距。退回默认字距会破坏品牌感。
- **句首大写的标题，以句号收尾。** 像 “Build and deploy on the AI Cloud.” 这样的标题以一个刻意为之的句号结尾——这个标点是品牌声音的一部分。
- **等宽字体仅用于技术层。** 区块眉题、代码块、终端示意。正文段落绝不用 mono 排版。
- **600 字重是展示字重的上限。** 几何无衬线体绝不出现在 700 / 800。正因如此，这个品牌读起来是一个更沉静的体系。

### 关于字体替代的说明

两款主字体是专有的（为品牌定制切割）。开源替代品：

- **几何无衬线体**——_Inter_（400 / 500 / 600）是风格上最接近的匹配；`font-feature-settings: "ss01", "ss02"` 可启用几何替代字形。_Satoshi_ 是尚可的第二选择。
- **等宽字体**——_JetBrains Mono_（400）在 12-13 px 上匹配这种技术语气。_IBM Plex Mono_ 是次优选择。

## Layout

### 间距体系

- **基本单位**：4 px。品牌的 `--geist-space` token 恰为 4 px，且每个捕获到的值都是 4 的倍数。
- **Token**：`{spacing.xxs}` 4 px · `{spacing.xs}` 8 px · `{spacing.sm}` 12 px · `{spacing.md}` 16 px · `{spacing.lg}` 24 px · `{spacing.xl}` 32 px · `{spacing.2xl}` 40 px · `{spacing.3xl}` 48 px · `{spacing.4xl}` 64 px · `{spacing.5xl}` 96 px · `{spacing.6xl}` 128 px · `{spacing.section}` 192 px。
- **区块内边距**：营销带上下使用 `{spacing.4xl}` 到 `{spacing.5xl}`。Hero 带拉伸到 `{spacing.section}`，给网格渐变留出呼吸空间。
- **卡片内部内边距**：营销卡片在 `{spacing.lg}` 到 `{spacing.xl}`；template-grid 卡片因处于更密的网格中而收得更紧，为 `{spacing.md}`。
- **行内间距**：按钮行、导航行和标签行的同级元素之间使用 `{spacing.sm}` 到 `{spacing.md}`。品牌的 `--geist-gap` 恰为 24 px。

### 栅格与容器

- **最大宽度**：约 1400 px（`--ds-page-width`）；遗留的 `--geist-page-width` 是 1200 px，仍出现在一些营销表面上。内容居中，桌面端水平留 `{spacing.lg}` 24 px 的间距，移动端 `{spacing.md}` 16 px。
- **分栏模式**：
  - 三特性行：桌面端 3 列，移动端 1 列（如 “Web Apps / Composable Commerce / Multi-tenant Platforms” 这样的行）。
  - 标签胶囊行：5 列居中的 `tab-ghost` 胶囊行。
  - 模板网格集群：桌面端 5 列，缩放到移动端 1 列。
  - 定价档位网格：桌面端 3 列，中间档位极性翻转。
  - Logo 条：约 5 个 Logo 宽，单行。

### 留白哲学

网格渐变承担了大部分重头装饰；留白负责分隔各条带。区块间距很慷慨——条带之间 `{spacing.4xl}` 到 `{spacing.5xl}` 让渐变得以呼吸。卡片内部，标题/段落的堆叠很紧（`{spacing.xs}` 8 px 间距），随后在 CTA 集群前留出更宽的间距。页面读起来像工程制品——大间隙 + 紧凑内部，绝不反过来。

### 响应式策略

#### 断点

| 名称       | 宽度        | 关键变化                                                                       |
| ---------- | ----------- | ------------------------------------------------------------------------------ |
| Mobile     | < 600px     | Hero 堆叠；导航折叠为汉堡菜单；3 列特性网格降为 1 列；标签胶囊行启用横向滚动。 |
| Tablet     | 600–959px   | 3 列网格降为 2 列；导航仍为横向。                                              |
| Desktop    | 960–1199px  | 完整的 3 列网格；定价 3 列。                                                   |
| Wide       | 1200–1399px | 容器内容宽度封顶在 1400 px。                                                   |
| Ultra-wide | ≥ 1400px    | 内容保持 1400 px 居中；条带在色彩上拉伸至全宽，但内容保持最大宽度。            |

#### 触控目标

`button-primary` 胶囊在导航中渲染为约 32 px 高，在营销场景中约 48 px 高。营销 CTA 在所有断点上都轻松满足 WCAG AAA；导航按钮在移动端通过 `{spacing.xs}` 内边距扩大触控区域，以满足 44 × 44 px 的下限。

#### 折叠策略

- **导航**：桌面端是完整链接行 + Ask AI / Log In / Sign Up 胶囊。移动端折叠为 Logo + 汉堡菜单，菜单以全屏浮层打开。
- **Hero**：网格渐变保持居中；标题 + 正文在所有断点垂直堆叠（该品牌不使用分栏 hero 模式）。
- **三特性行**：在上述断点处 3 列 → 2 列 → 1 列；卡片在所有视口都保持 `{rounded.md}` 8 px 的形状。
- **定价卡片网格**：桌面端 3 列，移动端垂直堆叠，`pricing-card-featured` 始终居中。
- **模板网格**：5 列 → 3 列 → 2 列 → 1 列。每个 `template-card` 的图片保持 16:9 比例。

#### 图片行为

- **网格渐变**：以行内 SVG 或 canvas 绘制渐变呈现；随 hero 容器流畅缩放；从不裁剪，从不平铺。
- **客户 Logo**：在 Logo 条中以单色 SVG 呈现；高度统一为 24 px。
- **代码编辑器示意**：深色 `{colors.primary}` 矩形，内部渲染 mono 文本；在布局层面按图片处理。
- **模板缩略图**：`{rounded.md}` 卡片外框内的 16:9 横幅；懒加载；占位状态使用一致的灰阶调色板。

## Elevation & Depth

| 层级                     | 处理方式                                                                                          | 用途                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Level 0 — Flat           | 无阴影，无边框。                                                                                  | 满幅 hero 带和极性翻转的深色区块。                |
| Level 1 — Inset Hairline | `0 0 0 1px #00000014` 内嵌 1 px 边框。                                                            | 默认卡片外框——品牌通用的“你能看见这张卡片”提示。  |
| Level 2 — Subtle Drop    | `0px 1px 1px #00000005, 0px 2px 2px #0000000a` 加内嵌发丝线。                                     | 略微抬升的卡片（template-grid、marketing-card）。 |
| Level 3 — Soft Stack     | `0px 2px 2px #0000000a, 0px 8px 8px -8px #0000000a` 加内嵌发丝线。                                | “中等”悬浮层级——特性网格卡片。                    |
| Level 4 — Float Stack    | `0px 2px 2px #0000000a, 0px 8px 16px -4px #0000000a` 加内嵌发丝线。                               | “大型”悬浮层级——定价卡片、重点提示面板。          |
| Level 5 — Modal          | `0px 1px 1px #00000005, 0px 8px 16px -4px #0000000a, 0px 24px 32px -8px #0000000f` 加内嵌发丝线。 | 弹层 / 对话框表面和下拉菜单。                     |

该品牌使用叠加式（STACKED）阴影——多层小偏移叠加以模拟自然光——从不用单一 8 px 模糊的通用投影。总是附加内嵌发丝线圆环，让卡片边缘保持锐利。

### 装饰性深度

- **网格渐变作为氛围深度**：hero 的多停靠点渐变是品牌唯一的“氛围”效果——作为扁平的 2-D 背景应用，而非 3-D 插画。
- **极性翻转的深色带作为区块深度**：把表面从 `{colors.canvas-soft}` 切换到 `{colors.primary}`（深墨色）是品牌在条带之间的主要深度线索。
- **内嵌阴影 + 投影组合**：卡片将内嵌 1 px 圆环与多段投影结合，产生“卡片落在页面上”的效果，却不会有厚重的材质感。

## Shapes

### 圆角刻度

| Token               | 值     | 用途                                                                             |
| ------------------- | ------ | -------------------------------------------------------------------------------- |
| `{rounded.none}`    | 0px    | 满幅 hero / 页脚带。                                                             |
| `{rounded.xs}`      | 4px    | 最紧的行内胶囊——`nav-cta-signup` 的 6 px 圆角按钮（映射到 `xs/sm`）。            |
| `{rounded.sm}`      | 6px    | 品牌的 `--geist-radius` token——应用内按钮、表单输入、下拉菜单的基础 UI 圆角。    |
| `{rounded.md}`      | 8px    | 品牌的 `--geist-marketing-radius` token——特性卡片、模板卡片。                    |
| `{rounded.lg}`      | 12px   | 略大的卡片外框（pricing-card 变体）。                                            |
| `{rounded.xl}`      | 16px   | 最大的卡片外框——当卡片承载 hero 大图封面时。                                     |
| `{rounded.pill-sm}` | 64px   | “AI Apps / Web Apps / Ecommerce / Marketing / Platforms” 行内的 tab-ghost 胶囊。 |
| `{rounded.pill}`    | 100px  | 营销 CTA 胶囊——`button-primary`、`button-secondary`、“Start Deploying” 胶囊。    |
| `{rounded.full}`    | 9999px | 图标按钮圆形容器、nav-link 幽灵胶囊。                                            |

### 图像几何

- **网格渐变**：满幅 2-D 氛围背景，绝不裁切进画框；被当作页面的壁纸。
- **客户 Logo**：单色 SVG，在 flex 行中保持一致的 24 px 高度。
- **代码编辑器示意**：16:10 深色矩形，`{rounded.md}` 圆角。
- **模板缩略图**：`{rounded.md}` 外框内的 16:9 横幅。
- **展示图像**：`{rounded.lg}` 到 `{rounded.xl}` 外框内的 2:1 或 16:9，带叠加阴影。

## Components

### 按钮

**`button-primary`** —— 标准的 100 px 圆角黑色胶囊，营销尺度。

- 背景 `{colors.primary}`，文本 `{colors.on-primary}`，标签用 `{typography.button-lg}`，内边距 `0px {spacing.sm}` 12 px，形状 `{rounded.pill}` 100 px。与营销 flex 布局搭配时渲染为约 48 px 高。

**`button-secondary`** —— 营销带中与黑色主按钮搭配的白色胶囊。

- 背景 `{colors.canvas}`，文本 `{colors.ink}`，排版 + 内边距与 `button-primary` 相同，形状 `{rounded.pill}`。

**`button-primary-sm`** —— 用于导航和定价卡片 CTA 中的小尺度主胶囊。

- 背景 `{colors.primary}`，文本 `{colors.on-primary}`，标签用 `{typography.button-md}`（14 px / 500），形状 `{rounded.pill}`。

**`button-secondary-sm`** —— 与 `button-primary-sm` 搭配的小尺度白色胶囊。

- 背景 `{colors.canvas}`，文本 `{colors.ink}`，排版 + 形状与 `button-primary-sm` 相同。

**`tab-ghost`** —— 居中行的标签胶囊（“AI Apps / Web Apps / Ecommerce / Marketing / Platforms”）。

- 背景 `{colors.canvas}`，文本 `{colors.ink}`，标签用 `{typography.body-sm}`，内边距 `0px {spacing.md}`，形状 `{rounded.pill-sm}` 64 px。

**`icon-button-circular`** —— 圆形图标容器（内部常是 “?” 或箭头）。

- 背景 `{colors.canvas}`，深色图标，1 px 实线发丝线边框，形状 `{rounded.full}`。

**导航 CTA：**

**`nav-cta-signup`** —— 导航行中的小型黑色 “Sign Up” 按钮。

- 背景 `{colors.primary}`，文本 `{colors.on-primary}`，标签 `{typography.body-sm-strong}`，内边距 `0px {spacing.xs}`，高度 28 px，形状 `{rounded.sm}` 6 px（品牌的 `--geist-radius`）。

**`nav-cta-login`** —— 导航中的白色 “Log In” 按钮。

- 背景 `{colors.canvas}`，文本 `{colors.ink}`，排版 / 高度 / 形状与 `nav-cta-signup` 相同。

**`nav-cta-ask-ai`** —— 带浅色边框的小型 “Ask AI” 按钮。

- 背景 `{colors.canvas}`，文本 `{colors.ink}`，1 px 实线 `{colors.hairline}` 边框（提取为 `0px solid rgb(235, 235, 235)`），排版 / 高度 / 形状相同。

### 卡片与容器

**`card-marketing`** —— 标准的营销特性卡片（3 列区块卡片）。

- 背景 `{colors.canvas}`，文本 `{colors.ink}`，内边距 `{spacing.lg}` 24 px，形状 `{rounded.md}` 8 px（即 `--geist-marketing-radius`）。带 Level 3 柔和叠加阴影。

**`card-marketing-large`** —— 用于 “compute model” / “AI Gateway” 重点提示的更大营销卡片。

- 背景 `{colors.canvas}`，文本 `{colors.ink}`，内边距 `{spacing.xl}`，形状 `{rounded.lg}` 12 px。带 Level 4 浮起叠加阴影。

**`card-soft`** —— 集群分组内使用的柔和着色卡片（比 canvas-soft 更浅）。

- 背景 `{colors.canvas-soft}`，文本 `{colors.ink}`，内边距 `{spacing.lg}`，形状 `{rounded.md}`。

**`template-card`** —— “Deploy your first app” 网格中的部署模板卡片。

- 背景 `{colors.canvas}`，文本 `{colors.ink}`，内边距 `{spacing.md}` 16 px，形状 `{rounded.md}` 8 px。顶部承载 16:9 缩略图。

**`code-editor-mockup`** —— 营销带内的深色代码预览表面。

- 背景 `{colors.primary}`，文本 `{colors.on-primary}`，正文用 `{typography.code}`（13 px / Geist Mono），内边距 `{spacing.lg}` 24 px，形状 `{rounded.md}` 8 px。

**`pricing-card`** —— 默认的定价档位卡片。

- 背景 `{colors.canvas}`，文本 `{colors.ink}`，内边距 `{spacing.xl}` 32 px，形状 `{rounded.lg}` 12 px。内部：档位名用 `{typography.display-md}`，价格用 `{typography.display-xl}`，特性列表为 `{typography.body-md}` 行，CTA 在底部。

**`pricing-card-featured`** —— 极性翻转的 “Pro” 档位卡片。

- 背景 `{colors.primary}`，文本 `{colors.on-primary}`，形状 + 内边距与 `pricing-card` 相同。CTA 反转为 `button-secondary-sm`（黑卡上的白色胶囊）。

### 输入与表单

**`form-input`** —— 标准文本输入框。

- 背景 `{colors.canvas}`，文本 `{colors.ink}`，1 px 实线 `{colors.hairline}` 边框，正文用 `{typography.body-sm}`（14 px），内边距 `0px {spacing.sm}`，高度 40 px（品牌的 `--geist-form-height`），形状 `{rounded.sm}` 6 px。

**`form-input-sm`** —— 小高度变体（32 px 高），用于紧凑表单。

- 与 `form-input` 相同，但高度 32 px（即 `--geist-form-small-height`）。

**`form-input-lg`** —— 大高度变体（48 px 高），用于 hero CTA。

- 与 `form-input` 相同，但高度 48 px（即 `--geist-form-large-height`）；正文用 `{typography.body-md}` 16 px。

### 导航

**`nav-bar`** —— 吸顶的顶部导航。

- 背景 `{colors.canvas}`，文本 `{colors.ink}`，高度 64 px（品牌的 `--header-height`），内边距 `{spacing.sm} {spacing.lg}`。布局：Logo 居左，链接行居中，“Ask AI / Log In / Sign Up” 集群居右。

**`nav-link`** —— `nav-bar` 内的居中链接行。

- 文本 `{colors.body}`，用 `{typography.body-sm}` 排版，内边距 `{spacing.xs} {spacing.sm}`，形状 `{rounded.full}`（幽灵胶囊——仅在悬停或激活时可见，但此处仍记录其圆角）。

**`footer`** —— 底部的 4 栏导航。

- 背景 `{colors.canvas}`，文本 `{colors.body}`，内边距 `{spacing.4xl} {spacing.lg}`。栏目标题用 `{typography.caption-mono}`（大写 mono 效果）；链接行用 `{typography.body-sm}`。

### 标志性组件

**`hero-band`** —— 带网格渐变背景的白色 hero。

- 背景 `{colors.canvas}`（某些表面上为 `{colors.canvas-soft}`），文本 `{colors.ink}`，内边距 `{spacing.4xl} {spacing.lg}`。内部：标题上方一个小 mono 徽章，标题用 `{typography.display-xl}`（句首大写、句号收尾），正文导语用 `{typography.body-lg}`，随后是 `button-primary` + `button-secondary` 的 CTA 行。网格渐变位于后方，缩放到大约占据条带的上半部分。

**`feature-mesh-band`** —— 次级区块，承载网格渐变的氛围背景，其上叠放特性文案。

- 背景 `{colors.canvas}`，文本 `{colors.ink}`，内边距 `{spacing.5xl} {spacing.lg}`。区块标题用 `{typography.display-lg}`；辅助正文用 `{typography.body-md}`。

**`showcase-band-light`** —— 柔画布区块（“Deploy your first app in seconds”）。

- 背景 `{colors.canvas-soft}`，文本 `{colors.ink}`，内边距 `{spacing.5xl} {spacing.lg}`。

**`showcase-band-dark`** —— 极性翻转的深色带（“A compute model for all workloads”）。

- 背景 `{colors.primary}`，文本 `{colors.on-primary}`，内边距 `{spacing.5xl} {spacing.lg}`。区块标题用 `{typography.display-lg}`（黑底白字）。常包含与条带齐平的 `code-editor-mockup`。

**`logo-strip`** —— 页面顶部附近的客户 Logo 环绕行。

- 背景 `{colors.canvas}`，文本 `{colors.body}`，内边距 `{spacing.lg} {spacing.xl}`。Logo 以单色 SVG 呈现，高度一致。

**`badge-secondary`** —— 小型行内元数据胶囊（“New”、“Beta”、“Live”）。

- 背景 `{colors.canvas-soft}`，文本 `{colors.body}`，正文用 `{typography.caption}`，内边距 `0px {spacing.xs}`，形状 `{rounded.full}`。

**`banner-marketing`** —— 页面顶部的 “Introducing X” 公告胶囊。

- 背景 `{colors.canvas-soft}`，文本 `{colors.body}`，正文用 `{typography.body-sm}`，内边距 `{spacing.xs} {spacing.sm}`，形状 `{rounded.full}`。

**`link-inline`** —— 正文文案中的行内链接。

- 文本 `{colors.link}`（`#0070f3`），正文用 `{typography.body-md}`，带下划线。

### 示例（示意）

> 自动推导的套件镜像演示表面（`scripts/derive-examples-block.mjs`）。每个 `ex-*` 条目都引用品牌原生基元，使下游消费者（`/preview-design`、`/generate-kit`）能一致地重皮同样的 10 个表面。`TO_FILL` 标记表示缺失的基元——在 LLM 判断环节解决。

**`ex-pricing-tier`** —— 默认定价档位卡片。复用 feature-card 外框，配品牌 canvas-soft 表面。

- 属性：`backgroundColor`、`textColor`、`borderColor`、`rounded`、`padding`

**`ex-pricing-tier-featured`** —— 精选 / 高亮档位——极性翻转表面（浅色模式下深色填充 + 浅色文本，深色模式下浅色填充 + 深色文本）。

- 属性：`backgroundColor`、`textColor`、`rounded`、`padding`

**`ex-product-selector`** —— “What's Included” 摘要卡片——为 SaaS / B2B 垂直场景改造（不是字面意义上的产品陈列）。

- 属性：`backgroundColor`、`rounded`、`padding`

**`ex-cart-drawer`** —— 订阅摘要——为 SaaS / B2B 改造用途（按附加项列出行项，不是字面意义上的购物车）。

- 属性：`backgroundColor`、`rounded`、`padding`、`item-divider`

**`ex-app-shell-row`** —— App Shell 示例内的侧边栏导航行。激活态使用品牌主色作为指示条。

- 属性：`backgroundColor`、`activeIndicator`、`rounded`、`padding`

**`ex-data-table-cell`** —— 默认数据表格 th + td 外框。表头使用 mono 大写眉题排版；正文使用 body-sm。

- 属性：`headerBackground`、`headerTypography`、`bodyTypography`、`cellPadding`、`rowBorder`

**`ex-auth-form-card`** —— 登录 / 注册卡片。复用 feature-card 外框，内含文本输入基元。

- 属性：`backgroundColor`、`rounded`、`padding`

**`ex-modal-card`** —— 弹层对话框表面——与 feature-card 相同的外框，带抬升阴影。

- 属性：`backgroundColor`、`rounded`、`padding`

**`ex-empty-state-card`** —— 空状态插画框。

- 属性：`backgroundColor`、`rounded`、`padding`、`captionTypography`

**`ex-toast`** —— Toast 通知表面——feature-card 形状 + 中等阴影。

- 属性：`backgroundColor`、`rounded`、`padding`、`typography`

## Do's and Don'ts

### 应该做

- 将 `{colors.primary}`（`#171717`）保留给全页的主 CTA。黑墨色就是转化目标。
- 每个营销尺度的 CTA 都用 `{rounded.pill}` 100 px，导航尺度按钮用 `{rounded.sm}` 6 px。两种胶囊尺度是有意共存的。
- 每个标题都用 `{typography.display-*}` 600 字重、句首大写，且常以句号收尾。激进的负字距是品牌声音的一部分。
- 品牌网格渐变仅用作 hero 尺度的氛围装饰——绝不缩小成图标，绝不简化为单一颜色。
- 分层叠加阴影（多个小偏移加内嵌发丝线），而不是单一的重投影。该品牌的悬浮层级比 Material 更沉静。
- 让页面表面在 `{colors.canvas-soft}` → `{colors.canvas}` → `{colors.primary}` 极性翻转带之间循环；深色带就是深度线索。
- 每个代码块和技术眉题都用 `{typography.code}` / `{typography.caption-mono}`。等宽字体就是平台的声音。

### 不要做

- 不要引入第六种强调色。该品牌以墨色 + 灰阶 + 四对渐变色板运作；新的强调色会压平这种声音。
- 不要用全大写渲染标题。句首大写 + 负字距不可妥协。
- 不要给卡片投下单一的重投影。该品牌的悬浮层级由叠加的小偏移 + 内嵌发丝线圆环构成。
- 不要以图标尺度或单色简化形式渲染品牌渐变。渐变只存在于 hero 尺度。
- 不要把几何无衬线体提升到 700 字重。该品牌的展示字重上限是 600。
- 不要在同一屏幕上把营销的 100 px 胶囊 CTA 造型与 6 px 导航圆角混用——选定一个尺度并保持下去。
- 不要用等宽字体排正文段落。等宽字体仅用于代码 + 技术标签。

---

## Application-Specific Adaptation

这份 DESIGN.md 由 Vercel 的营销站点为 **grilling-sleek**（一个单页问卷工具）改编而来。视觉语言（画布上的墨色、发丝线边框、叠加阴影、Inter 字体、负字距）得以保留；纯营销组件被舍弃，并从基元组合出适合工具的组件。

### 使用的组件（映射到 Vercel Token）

| 应用组件                          | Vercel 基元                | 样式                                                                                                                           |
| --------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| QuestionCard                      | `card-soft`                | `canvas-soft` 背景、`rounded.md` 8px、hairline 边框、`spacing.lg` 内边距                                                       |
| SingleControl（默认——radio）      | `form-input`               | 选项行带 hairline 边框；选中 = radio 指示器墨色填充（圆圈变墨色并带 on-primary 圆点）；行保持 canvas 背景                      |
| SingleControl（yesno——胶囊）      | `tab-ghost`                | `rounded.pill-sm` 64px；选中 = 墨色填充 + on-primary 文本                                                                      |
| SingleControl（rating——数字胶囊） | `tab-ghost`                | `rounded.pill-sm` 64px，最小宽度 48px；选中 = 墨色填充 + on-primary 文本                                                       |
| MultiControl（checkbox）          | `form-input`               | 与 SingleControl（默认）相同的选项行样式；选中 = checkbox 指示器墨色填充（方框变墨色并带 on-primary 对勾）；行保持 canvas 背景 |
| TextControl（textarea）           | `form-input`               | 80px 最小高度，hairline 边框，`rounded.sm` 6px                                                                                 |
| AdditionalNotes 字段              | `card-soft` + `form-input` | 与 QuestionCard 相同的外框                                                                                                     |
| Banner（错误 + 重试）             | `ex-toast`                 | `error-soft` 背景 + `error-deep` 边框 + 重试按钮                                                                               |
| TerminalPage                      | `ex-empty-state-card`      | `canvas-soft` 背景、`rounded.lg`、`spacing.3xl` 内边距、居中                                                                   |
| SubmitButton                      | `button-primary`           | 墨色背景、on-primary 文本、`rounded.pill` 100px                                                                                |
| Controls（主题 / 语言）           | `nav-cta-*`                | `rounded.sm` 6px，hairline 边框                                                                                                |
| Recommended 标记                  | `badge-secondary`          | `caption` 文本、弱化色、行内                                                                                                   |

### 舍弃的组件（无应用场景）

- `hero-band`、`feature-mesh-band`、`showcase-band-light/dark` —— 营销带
- `card-marketing`、`card-marketing-large`、`template-card` —— 营销卡片
- `pricing-card`、`pricing-card-featured` —— 定价档位
- `code-editor-mockup`、`logo-strip`、`footer` —— 营销外框
- 多停靠点网格渐变 —— 仅用于 hero 尺度装饰

### 深色主题（极性反转）

Vercel 把浅色 / 深色记录为一个极性翻转概念。深色主题反转 ink↔canvas 的 token 阶梯，同时保持语义色不变：

| Token                       | 浅色      | 深色      |
| --------------------------- | --------- | --------- |
| `primary`                   | `#171717` | `#ededed` |
| `canvas`                    | `#ffffff` | `#0a0a0a` |
| `canvas-soft`               | `#fafafa` | `#111111` |
| `hairline`                  | `#ebebeb` | `#262626` |
| `ink`                       | `#171717` | `#ededed` |
| `error`/`warning`/`success` | 不变      | 不变      |

通过 `[data-theme="dark"]` CSS 变量覆盖实现。主题选择（浅色 / 深色 / 跟随系统）由 `useTheme` hook 管理，带 `localStorage` 持久化 + `matchMedia` 跟踪。

### 字体

通过 `@fontsource-variable/inter` 使用 **Inter Variable**（文档记载的 Geist 替代品）。以 woff2 子集自托管（CSP `font-src 'self'`）。
