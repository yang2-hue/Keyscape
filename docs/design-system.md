# Keyscape 界面规范（v2 · 电影展厅）

2026-10-26：用户授权选择最合适的风格并优化正式页面，现采用 [Runway 方向](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/runwayml/DESIGN.md)。这是 Keyscape 的适配稿，使用系统无衬线，不是原站复刻或官方组件。以下 v2 规则优先于后面的历史 v1 记录。

- 构图：作品居中全幅展示；左上小字标、右上系列编号；底部中央为状态、五段轮播进度、暂停和复位组成的单个控制簇。禁止添加作品大标题。手机将索引移至左上，省略辅助操作提示。
- 色彩：日景中性浅色 #f4f4f2 / 正文 #141516 / 辅助 #5c6065；夜景近黑 #050607 / 正文 #f4f5f6 / 辅助 #a8adb4 / 面板 #111315。天气仅轻调日景墙面，场景灯光仍独立变化。
- 形状：面板和按钮统一 5px 小圆角，所有按钮 44×44px。pill-button 类名仅为兼容原有检查保留，外观不再是胶囊。移除横贯页脚的线条、背景渐变、装饰噪声与 UI 阴影。
- 字体：字标桌面 28px / 手机 26px，状态 12px，辅助信息至少 11px。图标改为 SVG，暂停名称和 title 随状态变化；复位保留独立名称。保留 2px/3px 键盘焦点环、按压 .95、减少动态与高对比回退。
- 验证：构建及专项浏览器检查记录在 outputs/ui-v20/，包含日夜、手机截图，以及焦点、44px 点击范围、320/390px 布局、暂停后复位、减少动态检查。本轮不代表模型美术或真机性能验收。

---

## 历史 v1（已被以上规则替代）

这份文件只描述**展厅外壳**——页标、控制条、状态层。作品本体（月湾的 3D 场景）不在范围内。

写法参照 [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) 里 84 份品牌设计文档的共同结构：先给令牌，再给规则，最后给"不要做什么"。那份仓库反复强调的两条，我们照抄了：**所有颜色/圆角/时长都写引用，不写内联值**；**只设计默认态与按压态，不把悬停当成一种状态**。

## 令牌

```yaml
paper:      "#e9e5dc"   # 展厅墙面；雨天 #b8c9c9、雾天 #e6e2d8、夜间 #1c3243
ink:        "#303e3a"   # 正文与控件；夜间 #f0e8d5
ink-muted:  "#57655c"   # 11px 标签的下限，对 paper 4.88:1
ink-faint:  "#7d897d"   # 只用于非文字的刻度
hairline:        rgba(124,136,124,.22)   # 分隔线
hairline-strong: rgba(124,136,124,.36)   # 控件描边、刻度
accent:     "#3f6b62"   # 唯一强调色；夜间 #a9c9bd
surface-hover/press:   白色 36% / 55%
radius:     pill 999px · circle 50%
motion:     press 140ms · 状态过渡 260ms · 背景 800ms · easing cubic-bezier(.22,.61,.36,1)
dwell:      20000ms（每个时刻的停留）
```

尺寸：控件桌面 40px、触屏 44px；标签 11px、按钮 12px/500、页标 33px/-1.8px。**11px 是文字下限**，9px 在浅色纸上无论怎么调对比度都不达标。

## 规则

1. **强调色只做交互信号。** 焦点环和"当前时刻"的刻度是仅有的两处，其余一律中性。这是 Apple（单强调色）、Linear（lavender 要稀缺）、Oura（一屏最多一个蓝色瞬间）三份文档里唯一完全一致的一条。
2. **按压是唯一会动的状态。** `:active` 缩到 0.95，悬停只改表面色，绝不位移。Apple 把它称作系统级微交互，其他家要么同样缩放、要么只换底色——没有一家用"上浮 1px"。
3. **焦点环 2px + 3px 偏移，用强调色。** 悬丝一样的描边控件如果没有可见焦点环，就等于只能用鼠标。
4. **一个控制簇。** 复位与暂停都在页脚右侧，画面中间不放任何浮动按钮。参照 Framer / Mercury 的图标按钮位置。
5. **文字只留必要信息。** 页标 + 手势提示 + 当前时刻 + 两个控件，没有别的。
6. **进度可见。** 展厅自己轮播，所以必须说明"现在在哪、还有多久"：五个刻度、当前一格拉长并在一个停留周期内填满。
7. **背景用 `background-color` 过渡，不用渐变过渡。** 渐变在浏览器里不可插值，只有颜色能真的 800ms 淡过去；中心高光另置一层用 `opacity` 过渡。
8. **三层偏好都要有回退**：`prefers-reduced-motion`（去掉所有动画，刻度直接显示"此刻"）、`prefers-reduced-transparency`（加载层改实色）、`prefers-contrast: more`（加深文字与描边）。

## 不要做

- 不要给卡片、按钮加投影。这套语言里只有作品本身有阴影。
- 不要引入第二个强调色，也不要把强调色用在装饰上（刻度已经用掉了一次配额）。
- 不要在页脚再加第三个按钮。要加功能，先想能不能砍掉一个。
- 不要把标签缩到 10px 以下换取"精致"。
- 不要让控件出现在画面中部；留白是作品的底座。
- 不要用两种以上圆角语法：胶囊 + 圆形，没有第三种。

## 来源与取舍

读了 [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) 里的 10 份文档（apple、linear.app、vercel、notion、oura、clay、mercury、superhuman、mintlify、framer），按"能不能用在只有 6 个元素的展厅"筛了一遍。

**采用了**

| 规则 | 出处 | 落点 |
|---|---|---|
| 令牌引用，禁止内联色值 | 全部 10 份的 Iteration Guide | `style.css` 顶部 `:root`，8 条天气/夜间规则从 3 段渐变字符串收成 1 个 `--paper` |
| 单强调色只做交互信号 | apple / linear.app / oura | `--accent` 只出现在焦点环与当前刻度 |
| 按压 `scale(.95)` | apple（"system-wide micro-interaction"）、framer、mercury | `.pill-button/.icon-button:active` |
| 悬停不改位置 | apple "never document hover"、vercel | 删掉原来的 `translateY(-1px)` |
| 焦点环 2px + 偏移 | apple（focus 2px solid primary） | `:focus-visible`，偏移 6px → 3px |
| 图标按钮 40 桌面 / 44 触屏 | framer、mercury、mintlify | 36px → 40px |
| 极简 overline 代替粗标题 | oura "quiet overlines" | 11px / 1.1px 字距的时刻标签 |
| 毛玻璃只用于浮层 | apple sub-nav `backdrop-filter` | 加载层；并提供 `prefers-reduced-transparency` 回退 |
| 对比度不足就先调文字 | apple / oura 的 Do 列表 | 9px → 11px，`--ink-muted` 提到 4.88:1 |

**没采用**

- **大标题 / display 字号体系**（所有家都有）：我们连标题都删了，展厅不需要层级。
- **主 CTA 与转化色**（apple 的 Action Blue、oura 的单一蓝）：展厅没有转化目标，唯一的"动作"是暂停，用中性胶囊更合适。
- **卡片、阴影、渐变氛围层**（vercel 的五级阴影、notion 的 pastel 卡片）：这套语言里只有作品本身有阴影；补一层卡片等于和作品抢注意力。
- **衬线标题**（oura）：中文衬线在 11–33px 这个区间会显旧，页标已经是 Inter 定宽负字距。
