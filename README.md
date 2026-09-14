# 知路 MVP

> 从一个问题出发，找到和你有话可说的人。

这是“知路”的第一版可运行闭环：

```text
问题输入 → 搜索向量 → 知乎搜索 → 观点岛 → 代表知友
        → 连接理由 → 原文证据 → 三种破冰草稿 → 编辑/复制/打开原文
```

## 本地启动

要求：Node.js 20～24。

```bash
npm install
copy .env.example .env
npm run dev
```

打开 <http://localhost:3000>。

## 数据模式

- 没有可用凭证：使用明确标注的演示数据，完整交互可用。
- 本机官方 `zhihu-cli` 已配置凭据，或部署环境注入有效 `ZHIHU_ACCESS_SECRET`：调用知乎搜索 API，生成基于真实搜索结果的观点岛和人物卡片。
- `ZHIHU_DATA_MODE=demo`：强制使用演示数据。

本地优先使用官方 CLI 的 Windows 凭据存储，项目会自动检测；`scripts/start-live.ps1` 可作为临时进程注入方案。云端使用部署平台 Secret。不要把真实密钥写入源码、`.env`、命令参数、日志或 Git。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-live.ps1
```

为节省赛事额度，真实模式每个新问题只调用一次知乎搜索；去重后可调用 LLM 生成动态岛，人物与引用仍由本地生成。相同问题在 24 小时内会命中服务缓存。缓存保存在 `.cache/`，不会提交到 Git。

## LLM 配置

在项目根目录的 `llm.local.json` 中填写 `apiKey`、`baseUrl` 和 `model`。
该文件已加入 `.gitignore`，不放入 `public/`，不要提交或分享。
新检出项目可复制不含密钥的 `llm.local.example.json` 为 `llm.local.json`。

- `apiKey`：提供商的 API Key，仅在本地文件或部署平台 Secret 中填写。
- `baseUrl`：API 根地址，包含版本前缀，例如 `https://api.openai.com/v1`；不要附加 `/chat/completions`。
- `model`：提供商支持 Chat Completions 和 JSON 模式的模型 ID。

部署时可设置 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`（本地 `.env` 也支持，由启动入口加载）。
只要任一变量存在，就整套使用环境变量，不与本地 JSON 混用；三个变量必须一起配置。
配置缺失、不完整、JSON 无效或地址无效时，分类返回 `failed`，继续使用固定岛 fallback。
配置模块读取密钥并添加认证头，分类业务不读取或返回密钥。

配置后启动或重启服务。演示模式、搜索内容不足及缓存命中时不会请求 LLM；
验证时使用真实搜索模式和未缓存的问题。缓存按模型、分类版本、推理档位和配置是否有效隔离；旧版缓存不会命中新版分类。

分类默认最多等待 40 秒，向模型仅发送每条证据的 ID、标题（最多 100 字符）和短摘要（最多 160 字符）。
要求直接返回 1–5 个岛、每岛一句简介，并完整且唯一分配证据；模型不需要生成岛 ID，服务端补齐，API 结构不变。
Chat Completions 输出上限为 4096 tokens（包含推理 tokens），JSON、证据校验及异常降级仍然保留。
`o4-mini` 和 `gpt-6-astra` 默认使用 `low` 推理档位；可在同一配置源设置 `reasoningEffort` / `LLM_REASONING_EFFORT` 为 `low` 或 `medium`。
其他模型不附加未经确认的推理参数。设置上述任一 LLM 环境变量时，三个必填环境变量仍需一起提供。

## 接口

- `GET /api/health`：健康检查和当前数据模式。
- `POST /api/explore`：输入问题，返回搜索向量、观点岛、人物和证据。
- `POST /api/icebreakers`：根据问题、人物与证据生成三种破冰草稿。

示例：

```bash
curl -X POST http://localhost:3000/api/explore \
  -H "Content-Type: application/json" \
  -d '{"question":"技术转 AI 产品值得吗？"}'
```

## 部署

部署为一个 Node Web Service：

- Build Command：`npm ci`
- Start Command：`npm start`
- Health Check：`/api/health`
- Secret：通过部署平台 Secret 注入 `ZHIHU_ACCESS_SECRET`

服务必须通过 `process.env.PORT` 监听 `0.0.0.0`，当前代码已经处理。

## 当前边界

搜索向量和破冰生成使用本地规则；动态岛由配置的 LLM 生成，失败时使用固定岛及主题化展示规则。LLM 不生成人物或引用。

演示模式中的人物和内容均为合成数据，并在界面中明确标注，不代表真实知乎用户。
