# Keyscape

把一颗键，变成一个值得停留的世界。

单键数字艺术展的本地交互原型。**当前只有一件作品：`月湾环抱`**——一颗月牙形的岛，把浅浅的泻湖抱在怀里。场景全部由代码程序化生成，默认不加载任何外部模型或贴图。

此前的 `潮汐之间`、`云门拱语`、`蓝洞来信` 三件作品已连同源码、参考图、测试与检查脚本一并移除，仓库只保留月湾这一条线。先读根目录 `agent.md`。

**当前状态：构建、测试与浏览器验证全绿。**

## 启动

需要 Node.js 22.12+、pnpm；在 Windows / Node 22–24 / pnpm 11 上验证。

```sh
pnpm install
pnpm dev              # http://127.0.0.1:5173/
pnpm build            # tsc -b + vite build
pnpm test             # 23 项单元测试（node --experimental-strip-types --test）
pnpm verify           # 21 项浏览器检查（需先跑 pnpm dev），产出 outputs/gallery-verify-v09/
pnpm accept:crescent  # 月湾逐项验收：6 张视角截图 + 扫光录屏 + check.json（约 5 分钟）
pnpm refs             # 参考图转 webp 两档（full 1600 / thumb 480）
```

## 已有体验

- 拖动／触摸旋转，滚轮或双指缩放，拉近与恢复视角，统一用正交相机。
- **日光／夜航**：夜里灯塔玻璃、窗、廊灯亮起，光束 26 秒扫一圈；白天整座灯塔不发光，只有石材与玻璃。
- **四种天气：晴 / 阴 / 雨 / 雾**。每种都是一组光照与雾的目标值，切换是阻尼过渡而不是硬切：
  - 晴：暖色主光、清晰投影
  - 阴：压平的主光、冷灰环境光、轻微霾
  - 雨：更冷的色温、雨丝与水面涟漪、雾加浓
  - 雾：指数雾把远侧的海和礁石溶进背景，水面着色器同样接入雾
- 暂停或系统开启「减少动态」时切到 `frameloop="demand"`：不空转渲染；暂停期间改天气／昼夜仍会把过渡走完（按帧计数，不依赖高帧率）。
- 点亮水面：单击泻湖抬升一道波，波场由 GPU 有限差分推进，船只姿态从同一波场采样。
- 美术参考弹窗；概念图与实际运行结果分开。本地 GLB 导入会校验外部资源、格式与大小，文件不上传，仅在本机预览。

## 结构

```text
src/App.tsx              展厅、相机、光照与天气、雾、后期、导入与状态
src/gallery-state.ts     视角状态（纯函数，可单测）
src/CrescentStudy.tsx    月湾装配、鱼群漫游、灯塔与船舶联动、昼夜开关
src/crescent-bay.ts      月湾地形、小屋、码头、灯塔、植被、船与鱼
src/crescent-access.ts   主路／支路／岸阶的布局与地形整平（纯函数）
src/HarborWater.tsx      共享场景捕获、水体着色器（接入场景雾）、树脂底座
src/water-dynamics.ts    GPU 有限差分波场与泊船采样
src/harbor-layout.ts     键帽轮廓、高度场（布局公共层）
src/coastal-materials.ts 本地确定性纹理与材质
src/weather.tsx          雨丝与水面涟漪
src/weather-model.ts     晴／阴／雨／雾的数值表（纯函数，可单测）
src/studio.tsx           本地反射环境与软件渲染器探测
src/studio-shadows.tsx   自研接触阴影（完整释放资源）
src/model.ts             用户 GLB 校验、归一化与资源释放
scripts/verify.mjs       浏览器验收（标题／渲停／注波／灯塔昼夜／四种天气／移动端）
scripts/crescent-acceptance.mjs  月湾产品验收（取景截图 + 扫光录屏 + 运动断言）
scripts/optimize-references.mjs  参考图 webp 转换
public/references/       已认可概念图（月湾，webp 全尺寸 + 缩略图）
outputs/                 每轮迭代的截图、检查记录与差距清单
```

React、TypeScript、Vite、Three.js、React Three Fiber、Drei、@react-three/postprocessing。无后端，默认场景不需要运行时远程模型、字体或 HDR 下载。

## 验证与边界

- `tsc -b` 0 错误；`pnpm test` 23/23 通过；`vite build` 通过。
- 生产包按库拆分为 `three`(705 kB) / `three-fiber`(423 kB) / `three-post`(89 kB) / 应用(118 kB)，`dist` 合计约 1.6 MB。three 单块仍 >500 kB，属库本体体积。
- `pnpm verify` 21 项浏览器检查：标题与文案、旧展厅控件已移除、点击注波（`waveImpulses` +1）、**白天灯塔不发光**、四种天气的雾与光照到达预设值且雾浓度依次递增、夜航点亮灯室与光束、播放／暂停的渲染回路（暂停后 2.5 s 内 0 帧）、暂停时冻结动画时间、暂停时天气过渡仍完成、恢复播放、移动端 44 px 点击区与控件不溢出、无页面错误。
- 检查环境是 Chrome / SwiftShader（约 3 fps），不能代表真实手机或硬件帧率。正式发布前需真机测试。
- 月湾的逐项对照见 `outputs/crescent-acceptance-v09/README.md`：码头过渡、灯塔入口、夜间扫光通过；台地与入户通路的**铺装辨识度**、夜景光束强度仍待美术判定。
- Draco / KTX2 需额外解码器，当前不支持；程序化场景未导出为独立 GLB；项目仅在本地运行，未发布。
