# 模型制作与复现

运行产品不需要 Blender，六件最终 GLB 已提交。各自来源与许可见
`public/models/ASSET-SOURCES.md`，原创资产使用根目录 MIT，扫描岩石保持 CC0。

如需编辑，自行安装 Blender 并在仓库根目录执行脚本，例如：

```sh
blender --background --factory-startup --python-exit-code 1 --python scripts/blender/author-olive-tree.py
blender --background --factory-startup --python-exit-code 1 --python scripts/blender/author-coastal-architecture.py
blender --background --factory-startup --python-exit-code 1 --python scripts/blender/author-harbor-props.py
```

脚本通过 Blender 自带的 bpy 与 NumPy 创建模型，输出最终 GLB 到 `public/models/`，
可编辑文件和中间记录到未提交的 `outputs/`。当前脚本的跨 Blender 版本兼容性
没有作为发布检查的一部分验证。运行会覆盖对应 GLB，修改前请保存自己的版本。

岩石处理脚本另外需要从 Poly Haven 官方下载 Coast Rocks 05 的 glTF 原始文件及
对应贴图，保留其相对目录，在本地放置为
`work/art-v21/source/coast_rocks_05/coast_rocks_05.gltf`，再执行：

```sh
blender --background --factory-startup --python-exit-code 1 --python scripts/blender/prepare-coastal-rocks.py
```

原始扫描文件不在本仓库中；只提供处理后的 CC0 GLB。没有这些输入时不要执行岩石脚本，
也不要将其描述为完全无外部输入的一键重建。

更新模型后，运行 `pnpm test` 检查实际 GLB 的边界与动线，并在浏览器检查比例、材质、
水深及透明物排序。概念生图与运行模型属于不同交付物，不保证图生 3D 自动还原效果。
