# 部署

纯静态 Vite 应用，无服务器、数据库或运行时密钥。

## GitHub Pages

公开仓库可在 GitHub Free 使用 Pages；私有仓库是否支持取决于账号方案。
不要为了部署自动更改仓库可见性。

Settings → Pages → Source 选 **GitHub Actions**。推送 `main` 后，
`.github/workflows/pages.yml` 测试、构建和发布，构建路径 `/Keyscape/`。
部署成功后的预期网址为 `https://yang2-hue.github.io/Keyscape/`，未成功前不能作为已上线链接。

使用仓库自带的 GITHUB_TOKEN 与 OIDC，无需个人 token。Fork 后改名需同步修改工作流的路径。

## Cloudflare Pages 备选

使用自己的 Cloudflare 登录连接仓库。构建命令 `pnpm build`，目录 `dist`，
Node 24、pnpm 11.25.0，根路径构建 `VITE_BASE_PATH=/`。
免费方案有构建次数、文件大小等限制，当前最大 GLB 不足 1 MB。

## 本地子路径检查

```powershell
$env:VITE_BASE_PATH='/Keyscape/'
pnpm build
pnpm preview
```

打开 `http://127.0.0.1:4173/Keyscape/`，所有 GLB 应从 `/Keyscape/models/`
加载，响应应是二进制模型而不是 HTML 回退。普通根路径构建时移除该环境变量。

官方规则：
- https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- https://developers.cloudflare.com/pages/platform/limits/

海外免费托管在中国大陆的可达性和速度仍需单独验证。
