# 参考实现纠偏记录

用户再次指出当前 Keyscape 与指定仓库差距过大。本次重新通过已连接 GitHub 核对 README、Experience、config、FishingVillage、materials、ResinWaterBlock、LightingRig、PostEffects 等文件，并对照本地原版提交 ce7a3e4d713411be8d3743ee1487d27f2fb84fb8。

原版入口 http://127.0.0.1:5194，当前入口 http://127.0.0.1:5173。同一次 Chrome / SwiftShader、1440×1000 检查的截图和记录在 outputs/reference-audit-v01。两个场景均实际加载，未记录到页面异常。软件渲染结果不代表原作硬件精细档的全部效果或帧率。

## 差距来自什么

| 项目 | 原作实际实现 | 当前 Keyscape |
| --- | --- | --- |
| 几何 | 地形、石屋、屋瓦、窗框、石砌块、码头、植被分别构建；重复细节实例化 | 主体为单网格生成 GLB；大量细节融合，局部切裁又带来表面和边缘问题 |
| 材质 | 石材、岩石、灰泥、木、沙、陶瓦分别有纹理、凹凸与粗糙度 | 主体一套生成材质，缺少逐类表面控制；提高面数无法替代这种分层 |
| 构图与光照 | 正交相机；环境图反射、半球光、软阴影；精细/均衡档有 SSAO、景深、Bloom、暗角 | 透视相机；本地 RoomEnvironment；普通方向光阴影与接触阴影；未实现原作同等后期链路 |
| 水与动态 | GPU 高度场、共享折射捕获、PMREM 环境反射、真实沙床与礁石近似深度，船体读取局部水面 | 共享颜色/深度捕获已实现，但波纹主要为解析动画，船体仍独立正弦运动 |

当前外观差距不是单个水色参数造成的。之前执行偏向追逐概念图的写实外观，却跳过原作的分离几何与统一材质构建。用户选择 Aholo 不意味着整个场景必须融合生成；主视觉结构应保持可控，生成工具用于适合的独立资产。

## 后续制作约束

1. 保留原作独立运行用于观察；不把第三方源码或资产直接混入发布代码。
2. 停止在现有融合主体上继续堆补丁；现有模型保留作对照与可复用资产。
3. 先以相近的相机、海陆比例、独立几何和材质建立清晰的微缩基线，再一起完成环境反射、柔和阴影与克制后期。
4. 在基线实际画面成立后适配单键外形与灯塔主题。功能检查、面数和概念图都不能替代画面对照。
5. 不为同一缺陷继续自动抽卡；本次核对无新增 Lux3D 生成，预算不变。

## 源码依据

- https://github.com/luoban25/resin-diorama-collection/blob/main/resin-bay/src/Experience.tsx
- https://github.com/luoban25/resin-diorama-collection/blob/main/resin-bay/src/scene/FishingVillage.tsx
- https://github.com/luoban25/resin-diorama-collection/blob/main/resin-bay/src/scene/materials.ts
- https://github.com/luoban25/resin-diorama-collection/blob/main/resin-bay/src/scene/ResinWaterBlock.tsx
- https://github.com/luoban25/resin-diorama-collection/blob/main/resin-bay/src/scene/LightingRig.tsx
- https://github.com/luoban25/resin-diorama-collection/blob/main/resin-bay/src/scene/PostEffects.tsx
