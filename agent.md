# Keyscape · 当前工作约定

## 最新产品验收要求

2026-10-25：用户要求将月湾的场景逻辑问题整理为文档，见 [月湾产品验收与整改要求](docs/crescent-product-acceptance.md)。后续实现须优先解决“船 → 码头 → 岸阶 → 主路 → 小屋／灯塔”的完整动线、可用台地与入口，以及夜间灯塔扫光；按该文档逐项交付实际证据。本次仅整理文档，不代表整改已完成或验收通过。

## 2026-10-26 第十四次更新（v13：去掉标题）

用户："给我把月湾环抱这几个雷霆大字去掉，恶心。"

- 删 `<section class="art-caption"><h1>月湾环抱</h1></section>` 与 `ARTWORK` 常量（App.tsx）、`.art-caption` / `.art-caption h1` 样式、只用在这里的 `@keyframes arrive`，以及残留的 `.import-button` 死规则。
- 舞台原本左内边距 14% 是为文字让位，改为居中：桌面 `inset:2% 7% 8%`、≥1700px `1% 8% 6%`、≤1050px `3% 5% 9%`、≤650px `12% 0 22% 0`。
- `scripts/verify.mjs` 的标题断言改为反向断言：`h1, h2, .art-caption` 数量为 0，且页面可见文本不含「月湾环抱」。
- 验收：tsc 0 错误、`pnpm verify` 30/30。

## 2026-10-26 第十三次更新（v12：穿模与抽搐）

用户反馈：船漂起来还会穿模；鱼碰到岩壁会抽搐。

**船为什么穿**（两个原因同时存在）：
1. 泊位 (0.10,-0.22) 落在码头 T 台边缘，船体 0.69 长、0.21 宽，与木板重叠约 2 cm。
2. 漂流圈以泻湖中心为圆心、半径 0.18，而码头伸到离中心仅 0.28（T 台还横跨 ±0.23），**任何一圈都会把船头扫过平台**。用 Node 直接对 `crescentHeight` + 码头足迹做网格搜索确认：中心圈在 R=0.10~0.22 全部 pier=0。

处理：
- 码头缩短：新增 `PIER_HEAD = rIn − 0.26`、`PIER_ANGLE`，`DOCK`（两段足迹盒）与建码头共用同一组常量。
- 船体 `scale 1.05 → 0.85`（长 0.53）。
- 泊位改为在**运行时高度场**上扫出来的无碰点：`(0.09, 0.32)` 朝向 `2.40`，间隙 0.11。注意必须用运行时的 `field`（含码头木板）扫，不能用 `crescentHeight`，两者结论不同。
- 漂流改为泊位 ↔ `(-0.16, 0.00)` 的正弦往返（`w = 0.5-0.5cos`），不再绕圈；`DRIFT_PERIOD = 34s`。
- **净空守卫**：每帧对船体 7 点取 `min(船下水量, 到两段码头盒的距离)`，< 0.05 就把目标点朝泊位拉 14%（最多 16 次）。不依赖布局数值。
- 点击：船体半沉在水下，点水线会被水面事件先吃掉 → 加随船移动的隐形代理盒（`transparent, opacity 0, depthWrite false`，`name='CrescentBoat'`）。

**鱼为什么抽搐**：旧代码是硬夹取——越界就地瞬移回边界并改朝向，下一帧又越界，于是逐帧来回抖。改为软约束：河床梯度找更深方向 → 只改朝向（`turnToward`）+ 极小位移推回（`min(.02, excess*.5)*delta*10`）；只有 `dist > RADIUS+.08` 或 `bed > water-.05` 才瞬移。竖直方向用 `damp` 追目标高度，不再逐帧赋值为硬夹取结果。

验收：19 单测、`pnpm verify` 29/29（含船体间隙、鱼群三条审计）、`accept:crescent` 11/11。证据 `outputs/gallery-verify-v11/`、`outputs/crescent-acceptance-v11/`。

**教训**：坐标类问题不要靠推理想象，直接 import 纯函数在 Node 里做网格搜索；但最终判定必须用运行时 `THREE.Heightfield`，因为码头木板也被烘进了高度场。

## 2026-10-26 第十二次更新（v11）

用户六点：删除导入作品；删除拉近观察；天气只留五种（早上晴/早上雨/晚上晴/晚雾/晚上雨）；鱼和船会穿模；鱼会游出边界；船要「点一次漂流、再点一次复位」；以及「three.js 这么强，能不能渲染更细致」。

1. **导入作品**：App 里的按钮/输入框/拖放/`importFile`、`src/model.ts`、`tests/model.test.ts` 全删；`package.json` 的测试清单同步。
2. **拉近观察**：删除 `＋`，`side-tools` 只剩 `↺`。
3. **五个时刻**：`CYCLE` 5 步；`weather-model.ts` 删掉 `overcast`（连同 table 与测试）；标签改为「早上 / 晚上」。
4. **穿模与越界**：
   - 根因一：泻湖中部 r 0.30–0.64 有 14 块礁石，鱼和船都在撞它。礁石整体移到岸边 r 0.54–0.66。
   - 根因二：鱼只有「转向」没有「约束」，受惊时速度 ×2.9 会冲出去。现在每帧硬约束：半径 ≤ `FISH_RADIUS`(0.42)、水深 ≥ `FISH_MIN_DEPTH`(0.16)、离船 ≥ 0.17，违反即推回并朝泻湖中心转向；y 夹在 `bed+0.055` 与 `water-0.05` 之间。
   - 验收新增 `__galleryLandmarks.audit()`，采样 5 次断言：半径、水深、离船距离、是否低于河床。
5. **船**：`boatMode: moored | drift | return`。第一次点击 → drift（26 秒一圈，持续）；第二次 → return（2.6 秒缓动回泊位）→ moored。`pose` ref 记录当前位置，`returnFrom` 保证从当前位置回家而不是瞬移。
6. **画质**：`surface()` 用 Sobel 从同一张画布生成法线贴图（`normalFrom`），全部材质 `bumpMap` → `normalMap` + `normalScale`；`retile()` 同时平铺 map 与 normalMap；地形陡坡（坡度 > 0.45）叠加高频几何位移（`grain` 双正弦，幅度 0.017），平地/步道坡度为 0 不受影响；阴影 4096²（软渲染 1024²）、SSAO 24、SoftShadows size 8/samples 16。

验收：19 项单测、`vite build`、`pnpm verify` **29 项全过**（含鱼群三条审计、船两次点击、五个时刻顺序）、`pnpm accept:crescent` 11 项全过。证据 `outputs/gallery-verify-v11/`、`outputs/crescent-acceptance-v11/`。

## 2026-10-26 第十一次更新（自动展览 · 交互 · 画质）

用户五点要求：撤掉美术参考；白天灯塔“还是没有完全熄灭”；渲染更精致、岩壁太粗糙；多加交互；天气与昼夜改成系统自动切换、不让用户调节；并再次问“导入作品”是什么。

1. **撤掉美术参考**：删 `ReferenceDialog`、侧栏缩略图、`public/references/`、`scripts/optimize-references.mjs`、`pnpm refs`。
2. **白天灯塔**：之前只把 `emissiveIntensity` 归零，但灯球颜色是 `#efe6cd`（近白），正午光下依然像亮着。改为深琥珀 `#4c4335` + `metalness .15`，白天读作玻璃灯具。夜航与点击时才发光。
3. **画质**：地形 112² → 176²；巨石 `SphereGeometry(1,16,12) → (1,32,20)`；石灰岩贴图平铺（地形 13×、巨石 7×）并加深 bump；terrain 着色器加竖向侵蚀（只作用于陡面）；顶点色按网格四邻算“折痕”烘焙 AO；阴影 2048² → 3072²；SSAO 半径 .072 / 强度 1.05。
4. **自动展览**：`CYCLE` 7 步（晴/阴/雨/雾/雾夜/晴夜/雨夜），`DWELL_MS = 20000`；删掉天气与昼夜按钮，只留只读标签；`visibilitychange` 时停表。`?dwell=` 仅 DEV 生效。
5. **交互**：`landmarkOf()` 沿父链找 `Lighthouse` / `CrescentBoat`；灯塔 `flash` 3.6 秒（`pulse = max(0,sin(flash*9))` 闪三下，同时光锥 0.95 rad/s），船 `tour` 13 秒绕泻湖 r=0.20 一圈（两端 smoothstep 缓入缓出），水面点击经 `HarborWater.onSplash` 回调惊鱼（鱼在水下，点不到，只能靠水波）。
   坑：船与鱼是 root 的**兄弟** primitive，事件处理器挂在 root 上收不到——三个 primitive 都要挂 `onClick/onPointerMove/onPointerOut`。
6. **`导入作品` 仍未删**：它是选择本地 `.glb`（贴图内嵌、≤50 MB）替换展厅模型的开发期工具，与作品无关。用户仍未表态删除，故保留；删它只需去掉 `src/model.ts` 与 App 里的导入分支。

验收：`tsc` 0 错误、23 项单测、`vite build` 1.3 MB、`pnpm verify` **24 项全过**、`pnpm accept:crescent` 11 项全过。证据：`outputs/gallery-verify-v10/`（晴/阴/雨/雾/夜/移动端截图 + check.json）、`outputs/crescent-acceptance-v10/`（6 视角 + 12 秒扫光 + check.json）。

DEV 句柄（生产包不含）：`__galleryCamera`（取景）、`__galleryCycle`（set/resume/state，冻结循环）、`__galleryLandmarks`（positions/screen，给测试点击用）。

## 2026-10-26 当前推进状态（v10，优先于下文一切历史描述）

**仓库只保留一件作品：`月湾环抱`。** 用户明确要求删除 `潮汐之间`、`云门拱语`、`蓝洞来信`，且“不要保留”。

已删除（工作区不再有，历史提交里仍在，未改写 git 历史）：`src/CoastalStudy.tsx`、`src/coastal-study.ts`、`src/CloudGateStudy.tsx`、`src/cloud-gate.ts`、`src/ArtKey.tsx`（其中 `StudioEnvironment` / `useSoftwareRenderer` 拆到新的 `src/studio.tsx`）、`tests/gate.test.ts`、三件作品的参考图 webp 与 `work/archive` 全部历史资产。`tests/harbor.test.ts` 改名 `tests/layout.test.ts`（测的是共享的键帽轮廓与高度场）。

展厅随之改造：没有作品切换、方向键切换和 `?work=<id>` 深链；画面上只剩作品名，编号／英文副标题／描述／study-label／竖排标语／edition 行全部删除。`src/gallery-state.ts` 只剩 `nextView`。

本轮同时改了三处视觉与一套系统：

1. **灯塔白天不再发光**：灯室玻璃的 `emissiveIntensity` 原本固定 0.18，白天看着是亮的；现在白天为 0，光锥与聚光灯也只由夜航驱动。
2. **天气由 2 种扩到 4 种**：晴／阴／雨／雾，新增指数雾；光照、雾、背景色、雨丝与水面涟漪联动。数值表在 `src/weather-model.ts`（纯函数，有单测），切换是阻尼过渡。
3. **水面着色器接入场景雾**：`HarborWater` 的 `ShaderMaterial` 加了 `fog` 与 `fog_pars_vertex/fog_vertex/fog_pars_fragment/fog_fragment`，并在 `uniforms` 里补 `fogColor` / `fogDensity` 占位（缺这两个，three 的 `refreshFogUniforms` 会在首次绘制抛 `Cannot read properties of undefined`）。否则雾天只有陆地变淡，海仍是一片饱和的青绿。
4. **按需渲染的过渡窗口改为按帧计数**（`TRANSITION_FRAMES = 100`）：原来按墙钟 1.6 秒，在 2 fps 的软渲染下只有三帧，天气过渡会停在半路；暂停时清空剩余窗口，保证“暂停即停帧”。

验收：`tsc` 0 错误、23 项单测、`vite build` 1.6 MB、`pnpm verify` 21 项全过。证据在 `outputs/gallery-verify-v09/`（含晴／阴／雨／雾／夜／移动端截图与 `check.json`）。

**`导入作品` 仍是唯一能看别的东西的入口**：选择本地 `.glb`（贴图与缓冲必须内嵌，≤50 MB），校验通过后归一化到键帽尺度放进同一个展厅，仅在本机预览、不上传。它与产品方向无关，属于早期遗留能力；用户若不想要，直接删 `src/model.ts` + `App` 里的导入分支即可。



## 2026-10-25 当前推进状态

用户在代码审查后要求“继续推进，感觉美术太离谱了”，已明确授权继续修改当前月湾实现，优先级高于下方历史“只做视觉交接”的限制。本轮聚焦 C/月湾，未调用付费资产生成。v02 调整建筑比例和屋顶、岩岸与沙滩、植被、灯塔位置、深浅水色；修复船只波场采样坐标，并将月湾测试纳入默认测试。实现文件仍为 src/crescent-bay.ts、src/CrescentStudy.tsx 与共用材质/水体模块。实际截图、检查结果和剩余差距见 outputs/crescent-v02/。直达预览 /?work=crescent。概念图写实精度仍未达到，美术验收仍由用户决定，不要将本次迭代称为已通过美术验收。

## 最新用户决定（优先于历史实现路线）

本轮只负责少量按键的视觉设计、提示词、设计说明和交接包。具体建模、网页、着色器、动画和工程集成全部交给后续工作模型；本轮不要继续修改业务实现代码或追赶原仓库功能。

只对部分按键进行艺术化设计。每颗键是独立画布，创作依据该键的字形、含义、形状或功能；不能仅把任意景观放在漂亮键帽上。未选按键保持普通或低调。键盘可以作为导航载体，但当前不制作整把连续海域，也不把高级键盘硬件外观当成作品主体。

沿用体验意图：点击被设计的键进入该键的主视图，可放大和旋转；具体承载界面、动画与技术方案由实现模型负责。当前图片是静态概念图，不是已实现界面或可运行 3D 场景。

## 当前设计交付

第一批提供 8 个独立探索方向：A、S、O、M、C、Enter、Space、Esc。它们只是候选，未经过用户筛选，不能默认全部进入制作。每个方向必须有独立大图、键与场景的对应理由、构图和材质要点、建议动态、实现时不能丢失的特征，以及原始提示词。

交付目录：`outputs/key-concepts-v01/`。

- `prompts.json`：内置 imagegen 的完整提示词。
- `DESIGN-BRIEF.md`：选键理由、视觉原则和每键设计卡。
- `IMPLEMENTATION-HANDOFF.md`：给下一个工作模型的输入、步骤、验收和输出清单。
- `index.html`：离线概念图浏览页；只用于设计审阅。
- `01-A-cloudgate.png` 至 `08-Esc-wayout.png`：各键独立视觉图，以最终实际文件为准。
- `image-manifest.json`：图像尺寸与校验值。
- `implementation-context.zip`：当前实现源码和配置的上下文快照；v06 动态实验尚未完成回归，状态见交接说明。

未选稿前的可逆技术准备已放在 `outputs/key-tech-review-v01/`（2026-10-25）：`CODE-REVIEW-v06.md` 是 v06 实验的代码审查（含点击注波未生效的疑似根因与修复方向，本轮未改实现代码）；`KEY-DECOMPOSITION-draft.md` 是 8 个候选键的草稿级技术拆解与风险评估，全部结论以用户选稿为准，不构成制作需求。

## 下一个工作模型应接收什么

读取本文件、上述设计交付目录、当前仓库和用户后续选稿反馈。原作参考是 https://github.com/luoban25/resin-diorama-collection ，用于理解清晰的微缩构建、分离材质与交互，不把后来的生成概念图误称为原作截图。旧实验记录在 docs/handoffs/agent-before-selected-key-design.md 与 docs/reference-implementation-audit.md。

首先明确用户选择的键和图稿版本。未选稿前只做可逆的技术拆解和风险评估，不批量生产全部候选，不擅自把用户没有选的概念当正式需求。

## 下一个工作模型必须交付什么

1. **制作拆解**：每颗入选键的场景层级、独立资产、几何/材质职责、动态对象、可复用项、未知部分、成本和依赖；说明哪些能由代码构建、哪些需要模型资产。
2. **可编辑工程与资产**：完整源码、可编辑建模源文件（若使用建模软件）、自包含 GLB 与贴图（若采用资产路线）、来源及版本记录。不要把水、船、鱼、植被全部融合成不可控粗模。代码原生几何不必为加载而强制导出再导入，但最终交付格式需说明。
3. **真实可查看结果**：可运行入口、安装/运行说明；实际 3D 主视角、近景、侧面和背面截图，8–15 秒实际录屏。AI 概念图与运行截图必须分开，不能用生图冒充实现。
4. **交互与动态**：实现选键放大、旋转和恢复；按各设计卡制作可感知的关键动态。以实际波形、姿态或顶点形变验证，不能只报告计时器增长。暂停/继续、减少动态和触摸操作均需处理。
5. **验证与差距清单**：构建和相关检查结果、真实设备性能或明确未测范围；与选稿逐项对照，说明未完成和合理改动。程序运行不代表美术通过，美术是否通过由用户决定。

现有 React / Three.js / R3F 工程可以复用，是否更换技术由后续模型提出理由。先完成一颗入选键并给出真实视觉，再扩展下一颗。自然地形、透明层和悬浮结构不能仅凭单张图假定所有背面都已确定；必须记录推断。

## 当前工程留存状态

主入口最近一次已验收技术检查是 art-v05 程序化海岸基线，检查与截图在 outputs/art-v05；这不是用户美术验收。用户转向设计交接前，art-v06 动态改动已经写入但未完成全面回归，勿称正式完成，也不要在本轮继续调试。

**2026-10-25 更新（用户指定当前会话接手实现）**：v06 点击注波未生效的根因已修复——`HarborWater.tsx toStudy()` 改为 `worldToLocal`，并允许侧裙入射命中顶面；浏览器验证 `waveImpulses 0→1`，暂停/恢复与作品切换无错误，证据在 outputs/crescent-v01/check.json。用户选稿 C/月湾后，v01 实现已交付：`src/crescent-bay.ts` + `src/CrescentStudy.tsx`，App 入口"02 月湾·泻湖"，测试 `tests/crescent.test.ts`（14/14 通过），截图与录屏及差距清单在 outputs/crescent-v01/。**月湾美术是否通过由用户决定。** 仍未完成：真机性能、内存泄漏审计、灯塔光晕与定向涌浪（见 GAP-LIST）。

**2026-10-25 第二次更新（月湾 v02→v03）**：v02 视觉迭代（石灰岩地形、小屋修复、灯塔移位、deepTint）见 outputs/crescent-v02/。v03 在其上补齐：傍晚灯塔光晕（PointLight+光晕 Sprite）、开口定向涌浪（HarborWater swellAmp/swellDir 参数化，海湾默认 0 不变）、烟囱旋转修正与死代码清理；审查与证据在 outputs/crescent-v03/（README、check.json、截图、录屏）。仍待：真机性能、内存审计、用户美术验收、下一颗键选稿。

**2026-10-25 第三次更新（内存审计）**：outputs/memory-audit-v01/ 完成作品切换内存泄漏审计。已修复：drei ContactShadows 无 dispose 的问题——新增 `src/studio-shadows.tsx` 本地替换（完整资源释放，视觉无回归）。已消除几何泄漏；JS heap 无单调增长。遗留小泄漏 +2 纹理/次切换（约几十 MB/百次，低危，来源未定位）。

**2026-10-25 第五次更新（月湾 v05 细节密度）**：小屋转角砌石/墙面石块/阶梯遮阳棚/门阶/窗板；船 20 段平滑壳+水线色带+红船底+卷帆索具+座板舵柄；薰衣草色层。证据 outputs/crescent-v05/。

**2026-10-25 第八次更新（A/云门 v01）**：新作品注册（第 03 件"云门拱语"）。src/cloud-gate.ts+CloudGateStudy.tsx：17 层叠层斜脊成三角拱洞（legLayerTransform 纯函数+结构测试：开口净空/不提前穿越/顶点相接）、石拱横桥前置可读+桥灯、雾墙 ShaderMaterial 渐变（弃 sprite 蛋形雾）、溪流/石阶/小人/灌木、奶油底座。22/22 测试。证据 outputs/gate-v01/。

**2026-10-25 第九次更新（v09 工程收口）**：代码审查后按 P1/P2 清单落地，未改任何美术表现以外的场景内容。①暂停／减少动态改用 `frameloop="demand"` + `DemandPump`（状态变化后 1.6 s 内继续出帧，保证昼夜过渡完成），CameraRig 自行 invalidate；实测暂停后 2.5 s 内 0 帧，昼夜切换仍有过渡帧。②`SceneBoundary` 增加 resetKey，崩一次不再只能刷新。③深链改为查表，`?work=harbor|crescent|gate` 均可达（解析逻辑抽到 src/gallery-state.ts 并单测）。④删除旧 GLB 链路：Harbor.tsx／HarborArchitecture.tsx／harbor-art.ts／harbor-surface.ts／mesh-repair.ts，`Weather` 独立为 src/weather.tsx；`public/models` 二进制归档到 work/archive/public-models（source.json 保留）。⑤三处重复的键帽轮廓收敛为 harbor-layout.keycapOutline()。⑥`swellDir` 改模块常量（此前内联数组导致水体 uniforms 每次父级重渲染失效）；删除 HarborWater 死代码 pointer/ripple，DEV 全局 `__harborDebug` 卸载时清除。⑦参考图 4×2.5 MB PNG → webp 两档（full 1600 / thumb 480），缩略图 22–40 kB；vite 按 three／three-fiber／three-post 拆包，dist 57 MB → 2.3 MB。⑧检查脚本从 work/ 收敛为受版本控制的 `scripts/verify.mjs`（13 项：深链／注波 waveImpulses+1／播放-暂停渲染回路／暂停冻结时间／暂停时昼夜仍过渡／恢复播放／移动端 44 px／导航不溢出／无页面错误），移动端导航改为 4 tab 单行、隐藏冗余箭头。实测：tsc 0 错误、25/25 测试、build 通过、verify 13/13 通过，证据 outputs/gallery-verify-v09/ 与 outputs/code-review-v09/REVIEW.md。**仍未完成：真机性能、月湾与云门的美术验收、下一颗键选稿。** 附带修复：云门雾墙 `PlaneGeometry` 未登记到 `geometries`，每次进云门泄漏 1 个几何体，已修；`scripts/memory-audit.mjs` 复测（outputs/memory-audit-v02/）显示切换不再逐次泄漏——首轮往返后纹理停在一次性 +5（three 透射渲染目标，首次进蓝洞建立），几何体持平，历史"+2 纹理/次切换"结论作废。

**2026-10-26 第十次更新（月湾产品验收材料）**：按 `docs/crescent-product-acceptance.md` 的 5 项要求交付逐项对照 `outputs/crescent-acceptance-v09/README.md`，未改动任何美术参数。新增 `scripts/crescent-acceptance.mjs`（`pnpm accept:crescent`）：以 DEV 专用 `window.__galleryCamera.frame/read` 取景（6 张截图构图可复现，check.json 存 target/position/zoom），11 项断言覆盖夜间灯室/扫光/暂停冻结/恢复/减少动态冻结且保留静态照明/录屏合成/无页面错误。实测：23 级岸阶落差 0.300、最大级高 0.0167、最小踏面 0.0265；两栋小门前地面 0.4300 与台地齐平；塔门距主路 <0.06、朝岛内点积 >0.9、塔院半径 0.17；扫光 0.24 rad/s（26 秒一圈），12 秒录屏实测转过 117°。**结论：码头过渡、灯塔入口、夜间扫光通过；台地与入户支路的铺装辨识度、夜景光束强度偏弱，等用户判定。真机性能仍未测。** 新增单测 `the lighthouse door is reachable from the main road and faces inland`（26 项）。工程坑：①Playwright `recordVideo` 在本机静默失败——自带 ffmpeg 只编进 libvpx-vp9 却请求 `-c:v vp8`，改用 CDP `Page.startScreencast` 抓帧 + 同一 ffmpeg 的 `image2pipe` 合成（该构建无 image2/concat demuxer，也需 `-vcodec mjpeg` 显式声明）；②软渲染下场景时间仅墙钟的 1/10（水波求解器每帧上限 6×1/120 s），扫光录屏需录 119 秒再按 ×9.9 重定时到 12 秒，否则 12 秒只转 13°。

**2026-10-25 第七次更新（月湾 v07）**：boulderGeometry 3 种子变体消除单一岩石形体复用；小屋窗玻璃专用 windowMaterial 暮色发光。证据 outputs/crescent-v07/。

**2026-10-25 第六次更新（月湾 v06 岛体与动线）**：响应用户"岩壁到码头没通路、岛太小房屋摇晃"——岛带加宽（rIn .70/rOut 1.30，滩台外扩）、小屋内移并四角取样打地基、九级石阶连接平台小路与码头栈道（植被避让）、海草深度过滤、鱼漫游半径收紧。证据 outputs/crescent-v06/。

**2026-10-25 第四次更新（月湾 v04 响应验收反馈）**：用户指出比例失真/细节不足/鱼群转圈/渡口突兀。v04 修正：灯塔瘦高化（约 3 倍小屋高）、小屋与船放大并按"船≈小屋宽"定标、泊位移到码头旁；渡口重做（岸阶→栈道→T 字突码头→系船柱/缆绳圈/下水台阶/海鸥）；鱼群改为独立漫游转向（避浅水与泊位）；新增 QualityProfile/PostChain 画质分级（硬件 dpr2+MSAA4，软渲染自动降级）。参考仓库已浅克隆到 work/reference-resin/ 仅供研读。证据 outputs/crescent-v04/。月湾美术是否通过仍由用户判断。

v06 涉及 src/water-dynamics.ts、src/scene-motion.ts、src/CoastalStudy.tsx、src/HarborWater.tsx、src/coastal-study.ts 和 src/harbor-layout.ts。构建通过；初步浏览器记录显示 GPU 波高、船姿态和鱼形变有变化。历史初步记录在 outputs/art-v06/initial-check.json，注波计数为 0 的问题已在上述更新中解决。后续实现模型按需接手或隔离这些实验，保留原件，不盲目回滚。

旧 Aholo 模型、离线预览和原始交付均保留。本轮不再调用 Lux3D 或提交付费生成。此前本对话累计授权 2100 积分，报价承诺用量 61、剩余 2039；这是历史对话预算，不是结算余额，也不能仅凭本文件授权新对话消费。账号密钥、签名链接和 work/lux3d 私有记录不进入交接包或版本库。

## 工作边界

本轮输出视觉与交接文件，不部署、不推送、不联系外部人员、不启动实现代理。使用内置 imagegen 生成概念位图，保存每个请求的最终图和提示词；不修改旧设计文件充当新版。生成图是方向探索，不能宣称已确定结构、可制造性或最终美术验收。
