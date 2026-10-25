# Keyscape 代码审查 · v09

2026-10-25，只读审查当前工作区（v08 月湾 + v01 云门）。**本次未修改任何业务源码**，只执行了类型检查、测试与生产构建（仅刷新被 gitignore 的 `dist/`、`tsconfig.tsbuildinfo`）。

## 本次实测结果

| 检查 | 结果 |
| --- | --- |
| `tsc -b` | 通过，0 错误 |
| `node --test`（5 个测试文件） | 25/25 通过（crescent 8 / gate 5 / harbor 4 / harbor-art 4 / model 4） |
| `vite build` | 通过，9.09s；主 chunk **1,375.99 kB（gzip 390.27 kB）**，仍有 >500 kB 警告；无 code-split |
| `dist/` 总量 | 57 MB，其中 46 MB 是 `public/models` 下的历史 GLB |

## 总体结论

渲染与几何生成的实现质量是扎实的：`legLayerTransform`、`stairTreads`、`gradeAccessTerrain` 这类布局逻辑被抽成纯函数并配了结构测试；资源释放有意识（`dispose()` 全链路、自研 `StudioShadows` 替换 drei 泄漏组件）；DEV 埋点（`dataset.waveImpulses` 等）让浏览器验收可自动化。

问题不在算法，而在三个方向：

1. **收口细节**：暂停/减少动态仍全速渲染、错误边界不可恢复、深链只认一件作品。
2. **可复现性**：仓库只有 1 个提交、41 项未跟踪；产出所有 `check.json` 的 20+ 个检查脚本躺在被 gitignore 的 `work/` 里，证据无法再生。
3. **死重量**：552 行旧 GLB 链路 + 46 MB 模型只为借用一个 `Weather` 组件而留在构建里；主 chunk 未拆包。

---

## P1 · 建议本轮修完（都在几十行内）

### 1. 暂停与"减少动态"时仍全速渲染

`src/App.tsx:121` 的 `<Canvas shadows dpr=...>` 没有 `frameloop`，全仓 `frameloop` / `invalidate` 零命中，即 R3F 默认 `always`：用户点"Ⅱ 暂停动态"或系统开启 `prefers-reduced-motion` 后，水面捕获 + SSAO + Bloom + SoftShadows 仍按满帧跑。这正是笔记本掉电和手机发热的主因，也和"静态模式"的语义矛盾。

建议：`frameloop="demand"` + 在 `useFrame` 内按需 `invalidate()`（有动画时每帧请求，暂停/静止时只靠交互相机触发）；或退一步，暂停时把 `HarborWater` 捕获与 `EffectComposer` 降到 10–15 Hz。

### 2. 错误边界崩一次就再也回不来

`src/App.tsx:31-37` 的 `SceneBoundary` 只有一个 `state.failed`，`App.tsx:201` 使用处没有 `key`，失败后切作品不会重建。用户唯一出路是整页刷新。

建议：`<SceneBoundary key={work.id + (imported?.uuid ?? '')}>`，或用 `getDerivedStateFromProps` 在 `work` 变化时复位。

### 3. 深链只实现了一件作品

`src/App.tsx:145`：`?work=crescent` 硬编码，`?work=gate` 会落到第 1 件。已有的 `works` 表本身就带 id，改成查表即可（并顺手支持 `?view=close`）。

### 4. 46 MB 死模型与 552 行死代码

依赖扫描结果：

- `src/mesh-repair.ts`（55 行）：**零引用**。
- `src/HarborArchitecture.tsx`（183 行）：**零引用**。
- `src/Harbor.tsx`（131 行）：只被 `CoastalStudy.tsx:9` 和 `CrescentStudy.tsx:9` 用来导入 `Weather`，其默认导出（`useGLTF` 三份 GLB 的旧组装版本）是死分支，却把 `harbor-art.ts`(117) + `harbor-surface.ts`(66) 一起挂在依赖图上。
- `public/models`：46 MB，仅服务这条死分支；`vite build` 无条件复制进 `dist/`。

建议：把 `Weather` 抽到 `src/weather.tsx`（无 GLB 依赖），整条旧链路连同 `public/models` 归档到 `work/`。构建目录可从 57 MB 降到 ~11 MB，同时消除"默认场景不加载 GLB"与"dist 里塞满 GLB"的矛盾。

### 5. 证据链不可复现

`work/` 被 gitignore，而 `work/check-crescent-v08.cjs`、`check-gate-v01.cjs`、`check-memory-v01.cjs` 等 20+ 个脚本正是所有 `outputs/*/check.json` 的生产工具；仓库当前只有 1 个提交（`c74510f`），之后全部改动未提交。

建议：把检查脚本收敛为一个参数化入口 `scripts/verify.mjs --work=crescent|gate|harbor`（纳入版本控制，输出 `check.json` + 截图 + 录屏），并在本轮做完后提交一次"v09 基线"。

---

## P2 · 正确性与体验细节

### 6. 最新版本的"点击注波"没有成功记录

`outputs/crescent-v08/verification.json` 只有 `splashCalls=1 / splashGate=dragged / waveImpulses=0`——即这次验证里点击被"拖动"门控拒绝，并非功能损坏（v01–v07 都有 `splashAccepted=1`）。但**最新版本是否存在回归，目前无证据**。

建议：在 `verify.mjs` 里加一条硬断言：程序化派发一次 `click`（无位移）后 `waveImpulses` 必须 +1，否则 fail。这是把"曾经能点"变成"一直能点"的最低成本手段。

### 7. 鱼群避障仍是"前瞻转向"，不是碰撞

`src/CrescentStudy.tsx:42-54`：只在候选前视点采样高度场决定转向，随后 `st.x += vx*delta` **无条件累加**，没有任何拒绝或扫掠检测。v04 审查记录过"鱼中心位于礁石内部"的数值复现；当前靠 `.48` 漫游半径收敛缓解（礁石多在外环），但转向上限与过冲会让鱼偶尔越过该半径，且没有任何测试守住这条约束。

建议：把鱼的运动核（`turnToward` + 障碍查询）抽成纯函数，用 `crescentHeight` + 岩石摆放规则做无浏览器的 180s 数值回归（沿用 `outputs/code-acceptance-v04/fish-reproduction.json` 的方法），断言任意时刻鱼身与地形最小间隙 > 0。

### 8. 水体顶面/侧壁接缝已收口，但没有测试

`src/HarborWater.tsx:23-26` 现在用 `upper = smoothstep(level-.04, level-.01, p.y)` 给顶面与侧壁施加同一份位移（v04 审查的最大 .016 裂缝据此闭合）。逻辑对，但纯靠人眼确认。

建议：加一条断言——侧壁顶部顶点（y=level）与对应顶面边界顶点在同一 `p.xz` 下位移完全相等；以后改 shader 若再引入 `top=0` 分支会立刻被拦下。

### 9. 内联 `swellDir` 破坏 uniforms 记忆化

`src/CrescentStudy.tsx:88` 传 `swellDir={[.28,-.96]}`（每次渲染新建数组）→ `HarborWater.tsx:139` 的 `useMemo` 依赖恒变 → `uniforms` 整包重建，`time/rain/dusk` 归零。切换昼夜或天气时会造成一次相位与渐变跳变。

建议：`const SWELL_DIR:[number,number]=[.28,-.96]` 提到模块级常量。

### 10. 键帽轮廓被复制三份

`studyFootprint`（coastal-study.ts:16）、`bayFootprint`（crescent-bay.ts:13）、`gateFootprint`（cloud-gate.ts:10）是逐字符相同的圆角方形轮廓，注释说明是"故意内联以免动基线"。现在三份已开始独立漂移的风险（任何一次微调都要改三处），且 `HarborWater` 依赖它们的点数与绕序。

建议：抽到 `harbor-layout.ts` 并加等价性测试（同一采样角度下三点坐标一致），把"不许动"变成"动了会红"。

### 11. 死代码与 DEV 全局未清理

- `src/HarborWater.tsx:173,182-187`：`pointer` ref 只写不读，`ripple()` 绑在 `onPointerMove` 上却无人消费（真正的注波在 `splash()`）。可删。
- `src/HarborWater.tsx:141`：DEV 下把 `resources`/`dynamics`/`gl` 挂到 `window.__harborDebug`，卸载时不解引用，切作品后仍持有已卸载场景。加 cleanup。

### 12. 移动端点击区域小于 44 px，且比桌面更小

`src/style.css`：`.round-button` 桌面 36×36，在 `@media(max-width:650px)` 里缩到 **32×32**；`.nav-arrow` 仅 `padding:10px 0`；`.work-tab` 字号 10px。手机端最小可点区被做得比桌面更小，与"手机是主场景"的定位相反。

建议：移动端断点把 `round-button` 提到 44×44、`work-tab` 行高 ≥44px，字号提到 12px（标题 10px 可保留）。

---

## P3 · 性能与资产

13. **每帧二次渲染**：`HarborWater` 的 `useFrame` 每帧 `gl.render(scene, camera)` 进 capture FBO，叠加 SSAO/Bloom/SoftShadows，draw call 翻倍。建议"相机或波场变化时才更新捕获"，静止时复用上一帧。
14. **首屏资产**：4 张 `public/references/*.png` 各 ~2.5 MB（共 9.9 MB），而 `side-tools` 里是缩略图展示、`ReferenceDialog` 才是大图。建议各出 webp 两档（thumbnail 480px / full 1600px），首屏可省 ~9 MB。
15. **拆包**：`vite.config.ts` 无 `build.rollupOptions`，three + postprocessing + react 全在一个 chunk。建议 `manualChunks: { three: [...], post: ['@react-three/postprocessing'] }`。
16. **遗留 +2 纹理/次切换**（`outputs/memory-audit-v01`）仍未定位；建议先在 DEV 下对 `gl.info.memory` 做切换前后快照对比（当前全仓零 `gl.info` 埋点），定位后再修，不要盲改释放逻辑。

---

## 已经确认修好的（避免重复劳动）

- 灯塔光束 `userData.ignoreHeightfield=true` 已设（crescent-bay.ts:40），并有测试守住。
- `disposeArtwork` 已覆盖 `Points` / `Line`（model.ts:51）。
- 云门雾墙更新走 `uniforms.uOpacity` 且同步 `material.opacity`，有测试（updateGateMist）。
- `pnpm test` 已包含 `tests/gate.test.ts`（25 项全跑）。
- 上月湾动线（`SHORE_STAIRS` + `stairTreads` + `keepAccessClear`）与夜间扫光（`beacon` + `SpotLight`）已在 v08 落地，`access-plan.svg` / `night-view.png` 已在证据目录。

## 文档与代码已经脱节（影响交接）

- `README.md` 仍写"两件作品切换""11 项单元测试"，实际 4 件 / 25 项；结构表未收录云门三个新文件。
- `docs/roadmap.md` 02 段仍描述"art-v05 GLB 基线"，未反映 v06–v08 与云门。
- `agent.md` 的迭代编号顺序错乱（第五次 → 第八次 → 第七次 → 第六次 → 第四次），且未记录 v08 与云门 v01。

---

## 下一步建议（按性价比排序）

**第 0 步 · 收口与基线（约半天）**
修 P1 全部 5 项；抽 `weather.tsx`、删 `mesh-repair.ts` / `HarborArchitecture.tsx` / `Harbor.tsx`、把 `public/models` 归档；跑通 `tsc + test + build`；更新 README / roadmap / agent.md；**提交一次 v09 基线**（当前 41 项未跟踪是最大的隐性风险）。

验收：`git status` 干净；`dist` < 15 MB；暂停后 GPU 帧率显著下降（可在 `check.json` 里记录 `requestAnimationFrame` 计数对比）。

**第 1 步 · 把"人眼验收"变成"脚本能红"（约半天）**
新增 5 条测试/断言：点击 → `waveImpulses+1`；鱼长期避障数值回归；水体边界位移一致性；三处 footprint 等价；`?work=` 深链解析。全部并入 `scripts/verify.mjs`。

验收：`node --test` 覆盖 30+ 项；`verify.mjs --work=<id>` 一条命令产出 `check.json` + 截图。

**第 2 步 · 性能（约一天）**
demand 渲染 + 捕获节流 + manualChunks + 参考图转 webp；用真机（用户设备）量一次首屏与稳态帧率，把软渲染数据明确标为"不代表真机"。

**第 3 步 · 月湾产品验收结案**
`docs/crescent-product-acceptance.md` 的 5 项通过标准，v08 证据基本齐备（动线布局图、主视角、俯视、近景、夜景）。缺的是一张**逐项对照表**（要求 → 证据文件 → 一句结论 → 未完成项），加一段 8–15 s 扫光录屏（v08 目录目前无 webm，v07 与云门 v01 有）。这一步只补齐材料，美术是否通过仍由用户判定。

**第 4 步 · 下一颗键**
从 A/S/O/M/C/Enter/Space/Esc 的候选稿里选一颗（C、A 已完成）。建议优先 S 或 O：与"水/拱"现有材质资产可复用，风险低于 Space（大面积平整地形）与 Enter（长条形构图）。
