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

为节省赛事额度，真实模式每个新问题只调用一次知乎搜索，随后在本地完成去重、观点归类和人物推荐；相同问题在 24 小时内会命中服务缓存。缓存保存在 `.cache/`，不会提交到 Git。

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

第一版使用确定性规则完成搜索向量、观点归类和破冰生成，目的是先验证完整产品流程。后续可以在不修改前端接口的情况下，将 `src/pipeline/explore.mjs` 中的规则替换为结构化大模型调用。

演示模式中的人物和内容均为合成数据，并在界面中明确标注，不代表真实知乎用户。
