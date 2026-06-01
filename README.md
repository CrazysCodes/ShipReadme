# ShipReadme

ShipReadme 是一个开源、自部署的 README 诊断与修复工具。输入公开 GitHub 仓库 URL 后，它会读取仓库结构和关键文件信号，生成 README 健康报告，并输出一版基于真实代码事实的 README.md 草案。

## MVP 功能

- 输入 GitHub 仓库 URL，无需登录或 OAuth。
- 使用 GitHub REST API 读取公开仓库的默认分支文件树。
- 识别 README、依赖清单、Docker、环境变量样例、LICENSE、测试、CI、截图素材等信号。
- 生成 0-100 分 README 健康报告。
- 每个问题都带证据，例如检测到 `Dockerfile` 但 README 缺少 Docker 部署说明。
- 生成可编辑、可预览、可复制的 README Markdown 草案。

## Quick Start

```bash
npm install
npm run dev
```

打开 http://localhost:3000。

## Configuration

复制环境变量样例：

```bash
cp .env.example .env.local
```

可选配置：

- `GITHUB_TOKEN`: 提高 GitHub REST API 速率限制。只需要公开仓库读取能力。
- `MAX_REPOSITORY_TREE_ITEMS`: 仓库文件树最大条目数，默认 `3000`。
- `MAX_FETCH_FILE_BYTES`: 单个关键文件最大读取字节数，默认 `120000`。

## Scripts

```bash
npm run dev
npm run typecheck
npm run build
```

## README 规则策略

第一版使用规则引擎和模板生成，刻意不依赖 AI：

- Quick Start: 对照 `package.json` scripts、Python/Rust/Go 清单，检查 README 是否给出真实启动入口。
- Configuration: 对照 `.env.example`，检查 README 是否说明环境变量。
- Testing: 对照测试目录、测试脚本和 GitHub Actions。
- Deployment: 对照 `Dockerfile` 和 Compose 文件。
- License: 对照 `LICENSE` 文件。
- Contributing: 检查 README 或 `CONTRIBUTING.md`。
- Screenshots / Demo: 对照 `public/assets` 或 `public/images` 中的图片素材。

后续可以在保留规则证据的基础上接入 OpenAI 改写层，但不应让 AI 编造仓库里不存在的命令。
