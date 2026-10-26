# 发布检查 · 2026-10-26

- 产品版本：`4debc2a67ea0ef1bc33172032fbba3af0d9d8267`。
- 仓库已由所有者授权改为公开，MIT 与第三方 CC0 声明已提交。
- Git 上传通道不可达时，通过 GitHub Git Database API 上传原有对象；逐个核验 SHA，保留全部提交，以非强制方式更新 main。
- `pnpm test`：27/27 通过。
- `VITE_BASE_PATH=/Keyscape/ pnpm build`：通过，保留较大 3D 依赖的体积提示。
- [首次线上构建和部署](https://github.com/yang2-hue/Keyscape/actions/runs/40344632575)：build 与 deploy 均成功。
- [正式站点](https://yang2-hue.github.io/Keyscape/)：实际浏览器打开成功，六件 GLB 均 HTTP 200，首页链接为 `/Keyscape/`，未发现页面或着色器错误，开发时刻切换接口未暴露。
- 生产加载检查使用 Chrome / SwiftShader，已检查画面能正常呈现；不等同于全交互回归、真实硬件性能或中国大陆访问速度验收。
- 最终版本未重跑完整 42 项浏览器回归。历史专项结果只证明对应检查范围。

后续概念文档和图片不改变当前线上场景。新方向先评审，不能把 AI 概念图当作已实现产品截图。
