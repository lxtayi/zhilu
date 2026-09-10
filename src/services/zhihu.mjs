import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { extractItems, normalizeZhihuItem } from "../lib/normalize.mjs";

const SEARCH_ENDPOINT = "https://developer.zhihu.com/api/v1/content/zhihu_search";
const execFileAsync = promisify(execFile);

export class ZhihuApiError extends Error {
  constructor(message, code = "UPSTREAM_ERROR", status = 502) {
    super(message);
    this.name = "ZhihuApiError";
    this.code = code;
    this.status = status;
  }
}

function mapUpstreamCode(code) {
  if (Number(code) === 20001) return "AUTH_REQUIRED";
  if (Number(code) === 30001) return "RATE_LIMITED";
  if (Number(code) === 10001) return "QUERY_INVALID";
  return "UPSTREAM_ERROR";
}

export function resolveZhihuCliPath() {
  const candidates = [
    process.env.ZHIHU_CLI_PATH?.trim(),
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "ZhihuCLI", "current", "zhihu-cli.exe")
      : ""
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) || "";
}

export function hasZhihuSearchCredential() {
  return Boolean(process.env.ZHIHU_ACCESS_SECRET?.trim() || resolveZhihuCliPath());
}

async function searchZhihuWithCli(query, { count, timeoutMs }) {
  const cliPath = resolveZhihuCliPath();
  if (!cliPath) {
    throw new ZhihuApiError("服务尚未配置知乎搜索凭证。", "AUTH_REQUIRED", 503);
  }

  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      cliPath,
      [
        "search",
        "zhihu",
        "--query",
        query,
        "--count",
        String(Math.min(Math.max(count, 1), 10)),
        "--timeout",
        `${Math.max(Math.ceil(timeoutMs / 1000), 1)}s`
      ],
      {
        encoding: "utf8",
        timeout: timeoutMs + 2000,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024
      }
    ));
  } catch (error) {
    const payload = JSON.parse(String(error?.stdout || "null"));
    const cliCode = payload?.error?.code;
    const code = cliCode === "AUTH_REQUIRED" || cliCode === "AUTH_INVALID"
      ? "AUTH_REQUIRED"
      : cliCode || "UPSTREAM_ERROR";
    throw new ZhihuApiError(
      payload?.error?.message || "知乎 CLI 搜索失败。",
      code,
      code === "AUTH_REQUIRED" ? 503 : 502
    );
  }

  const payload = JSON.parse(stdout);
  const upstreamCode = payload?.Code ?? payload?.code;
  if (upstreamCode !== undefined && Number(upstreamCode) !== 0) {
    throw new ZhihuApiError(
      payload?.Message || payload?.message || "知乎搜索返回业务错误。",
      mapUpstreamCode(upstreamCode)
    );
  }

  return extractItems(payload).map((item) => normalizeZhihuItem(item, query));
}

export async function searchZhihu(query, { count = 10, timeoutMs = 9000 } = {}) {
  const secret = process.env.ZHIHU_ACCESS_SECRET?.trim();
  if (!secret) {
    return searchZhihuWithCli(query, { count, timeoutMs });
  }

  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("Query", query);
  url.searchParams.set("Count", String(Math.min(Math.max(count, 1), 10)));

  let response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${secret}`,
        "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    const message = error?.name === "TimeoutError"
      ? "知乎搜索请求超时。"
      : "无法连接知乎搜索服务。";
    throw new ZhihuApiError(message);
  }

  const payload = await response.json().catch(() => null);
  const upstreamCode = payload?.Code ?? payload?.code;

  if (!response.ok || (upstreamCode !== undefined && Number(upstreamCode) !== 0)) {
    const code = mapUpstreamCode(upstreamCode);
    const message = payload?.Message || payload?.message || `知乎搜索返回 HTTP ${response.status}`;
    throw new ZhihuApiError(message, code, response.status || 502);
  }

  return extractItems(payload).map((item) => normalizeZhihuItem(item, query));
}

export async function searchManyZhihu(queries) {
  const settled = await Promise.allSettled(
    queries.map((query) => searchZhihu(query))
  );

  const items = [];
  const warnings = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    } else {
      warnings.push({
        query: queries[index],
        code: result.reason?.code || "UPSTREAM_ERROR",
        message: result.reason?.message || "搜索失败"
      });
    }
  });

  return { items, warnings };
}
