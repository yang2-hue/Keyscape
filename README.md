# Keyscape

把一颗键，变成一个值得停留的世界。

当前为单键数字艺术展的本地交互原型，已接入 4 件作品：`01 灯塔·渔港`、`02 月湾·泻湖`、`03 云门拱语`、`04 蓝洞来信`（早期习作）。除蓝洞外均为代码原生程序化微缩场景，默认场景不加载任何 GLB。第一批 A / S / O / M / C / Enter / Space / Esc 概念图、逐键说明与完整提示词在 `outputs/key-concepts-v01/`。先读根目录 `agent.md`。

**当前状态：构建、测试与浏览器验证全绿；月湾与云门的美术是否通过仍由用户判定。**

## 启动

需要 Node.js 22.12+、pnpm；在 Windows / Node 22–24 / pnpm 11 上验证。

```sh
pnpm install
pnpm dev          # http://127.0.0.1:5173/
pnpm build        # tsc -b + vite build
pnpm test         # 25 项单元测试（node --experimental-strip-types --test）
pnpm verify       # 浏览器验收（需先跑 pnpm dev），产出 outputs/gallery-verify-v09/
pnpm refs         # 参考图转 webp 两档（full 1600 / thumb 480）
```

直达某件作品：`/?work=harbor|crescent|gate|grotto`。

## 已有体验

- 拖动／触摸旋转，滚轮或双指缩放，近景与恢复视角；三件程序化作品使用正交相机。
- 四件作品切换，桌面左右方向键切换，地址栏可深链。
- 日光／暮色（月湾为夜航）、晴天／小雨，船与鱼的动态，暂停。
- 暂停或系统开启「减少动态」时切到 `frameloop="demand"`：不再空转渲染，但相机、光照与天气的过渡仍会完成。
- 点亮水面：单击泻湖抬升一道波，波场由 GPU 有限差分推进，船只姿态从同一波场采样。
- 美术参考弹窗；概念图与实际运行结果分开。本地 GLB 导入，校验外部资源、格式与大小，文件不上传。

## 结构

```text
src/App.tsx              展厅、相机、光照、后期、导入与状态
src/gallery-state.ts     深链解析与视角状态（纯函数，可单测）
src/CoastalStudy.tsx     渔港装配、船鱼动画与天气
src/coastal-study.ts     渔港的程序化几何与实例构建
src/CrescentStudy.tsx    月湾装配、鱼群漫游、灯塔与船舶联动
src/crescent-bay.ts      月湾地形、小屋、码头、植被、船与鱼
src/crescent-access.ts   主路／支路／岸阶的布局与地形整平（纯函数）
src/CloudGateStudy.tsx   云门装配
src/cloud-gate.ts        云门斜脊、横桥、雾墙、溪流
src/HarborWater.tsx      共享场景捕获、水体着色器、树脂底座
src/water-dynamics.ts    GPU 有限差分波场与泊船采样
src/harbor-layout.ts     键帽轮廓、高度场、寻路（布局公共层）
src/coastal-materials.ts 本地确定性纹理与材质
src/weather.tsx          雨丝与水面涟漪
src/studio-shadows.tsx   自研接触阴影（完整释放资源）
src/ArtKey.tsx           蓝洞早期习作与本地反射环境
src/model.ts             用户 GLB 校验、归一化与资源释放
scripts/verify.mjs       浏览器验收脚本（深链／渲停／注波／移动端点击区）
scripts/optimize-references.mjs  参考图 webp 转换
public/references/       已认可概念图（webp 全尺寸 + 缩略图）
public/models/           历史 GLB 的来源与校验记录（二进制已归档，不再加载）
outputs/                 每轮迭代的截图、检查记录与差距清单
```

React、TypeScript、Vite、Three.js、React Three Fiber、Drei、@react-three/postprocessing。无后端，默认场景不需要运行时远程模型、字体或 HDR 下载。

## 验证与边界

- `tsc -b` 0 错误；`pnpm test` 25/25 通过；`vite build` 通过。
- 生产包按库拆分为 `three`(705 kB) / `three-fiber`(426 kB) / `three-post`(89 kB) / 应用(154 kB)，`dist` 合计约 2.3 MB。three 单块仍 >500 kB，属库本体体积。
- `pnpm verify` 13 项浏览器检查：三件程序化作品的深链、点击注波（`waveImpulses` +1）、播放／暂停的渲染回路（暂停后 2.5 s 内 0 帧）、暂停时冻结动画时间、暂停时昼夜过渡仍渲染、恢复播放、移动端 44 px 点击区与导航不溢出、无页面错误。
- 检查环境是 Chrome / SwiftShader（约 3 fps），不能代表真实手机或硬件帧率。正式发布前需真机测试。
- 月湾的艺术水准、真机性能、切换时的少量纹理残留（`outputs/memory-audit-v01`）仍未结案。
- Draco / KTX2 需额外解码器，当前不支持；程序化场景未导出为独立 GLB；项目仅在本地运行，未发布。

历史生成资产与 SHA-256 记录保留在 `public/models/*/source.json`，二进制已归档到 `work/archive/`。对照依据见 `docs/reference-implementation-audit.md`。
