# GPT-Git1 · 时光备忘录

GitHub Pages + Cloudflare Worker + GitHub Gist 的多用户、多设备备忘录。

## 最终架构

浏览器
→ GitHub Pages（本仓库根目录）
→ Cloudflare Worker（登录、Session、Gist API）
→ GitHub Gist（每个用户一个私有 notes.json）

Cloudflare KV 只保存用户认证信息和 Session；备忘正文保存在私有 Gist。

## 一、把项目放入 GitHub 仓库

本项目的 `src/`、`index.html`、`package.json`、`vite.config.js`、`.github/` 都位于仓库根目录。

`worker/` 可以直接保留在同一个 GitHub 仓库中；GitHub Pages workflow 只发布 Vite 的 `dist/`，不会把 Worker 当作网站文件发布。

## 二、先部署 Cloudflare Worker

需要安装 Node.js 22+。

```bash
cd worker
npm install
npx wrangler login
```

创建 KV：

```bash
npx wrangler kv namespace create USERS
```

把命令输出的 namespace id 填到 `worker/wrangler.toml`：

```toml
[[kv_namespaces]]
binding = "USERS"
id = "这里替换成真实 ID"
```

然后设置两个 Worker Secret。

### 1. GitHub Gist Token

在 GitHub 创建 Fine-grained Personal Access Token，至少给当前账号的：

`Gists → Read and write`

GitHub 官方文档明确要求创建/更新 Gist 使用 Gists user permission 的 write 权限。

```bash
npx wrangler secret put GITHUB_GIST_TOKEN
```

粘贴 Token 后回车。

### 2. 允许访问的网站域名

第一次部署前，在 `worker/wrangler.toml` 中设置：

```toml
[vars]
ALLOWED_ORIGIN = "https://你的GitHub用户名.github.io"
```

如果仓库名为 `GPT-Git1`，默认 Pages 地址通常类似：

`https://你的GitHub用户名.github.io/GPT-Git1/`

注意：`ALLOWED_ORIGIN` 只填写 origin，不要包含 `/GPT-Git1/` 后面的路径。

例如：

```toml
ALLOWED_ORIGIN = "https://example.github.io"
```

部署：

```bash
npx wrangler deploy
```

记录 Worker 地址，例如：

```text
https://memo-calendar-api.example.workers.dev
```

## 三、配置 GitHub Pages 前端

在 GitHub 仓库：

`Settings → Secrets and variables → Actions → Variables`

新增：

```text
VITE_API_BASE
```

值填写你的 Worker 地址：

```text
https://memo-calendar-api.example.workers.dev
```

不要在这里放 GitHub Token。

## 四、启用 GitHub Pages

进入：

`Settings → Pages`

Build and deployment 选择：

`GitHub Actions`

之后 push 到 `main`，`.github/workflows/pages.yml` 会自动：

1. 安装 Node
2. 安装 npm 依赖
3. `npm run build`
4. 发布 `dist`
5. 部署 GitHub Pages

GitHub 官方 Pages Actions 使用 `upload-pages-artifact` + `deploy-pages` 的方式发布站点。

## 五、第一次测试

打开 Pages 网站：

1. 注册一个新邮箱和至少 8 位密码
2. 注册成功后 Worker 会自动创建一个私有 Gist
3. 添加一条备忘
4. 刷新网页
5. 在另一台设备打开同一个 Pages 地址并登录
6. 应看到相同备忘

## 六、重要安全事项

不要把下面内容提交到 GitHub：

- `GITHUB_GIST_TOKEN`
- 真实密码
- 任何 `.dev.vars` / 私密配置

本项目已经把 Gist Token 设计为 Cloudflare Worker Secret。

## 七、数据模型

每个用户一个私有 Gist：

```json
{
  "version": 1,
  "updatedAt": "2026-09-27T00:00:00.000Z",
  "notes": {
    "2026-09-27": {
      "title": "今天",
      "content": "完成项目",
      "updatedAt": "2026-09-27T00:00:00.000Z"
    }
  }
}
```

## 八、生产环境建议

当前版本适合个人/小规模使用。

如果后续需要大量用户、附件、实时协作、全文搜索、提醒队列等功能，建议把备忘正文迁移到数据库（例如 Cloudflare D1），而继续保留 GitHub Gist 作为导出/备份功能。

Gist API 单文件通过 API 返回时存在内容大小限制；官方文档说明单个文件 API 内容超过 1 MB 时会出现 `truncated`，更大的文件需要通过 raw URL 或 clone 获取。

## 本地开发

前端：

```bash
npm install
npm run dev
```

Worker：

```bash
cd worker
npm install
npx wrangler dev
```

本地 Worker 需要自己的本地变量配置，详见 Cloudflare Wrangler 文档。
