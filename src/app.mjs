import express from "express";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLlmClient } from "./config/llm.mjs";
import { exploreCacheKey } from "./lib/explore-cache-key.mjs";
import {
  buildIcebreakers,
  currentDataMode,
  exploreQuestion
} from "./pipeline/explore.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(moduleDir, "../public");
const cacheFile = path.resolve(moduleDir, "../.cache/explore.json");

const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function loadCache() {
  try {
    const text = readFileSync(cacheFile, "utf8").replace(/^\uFEFF/u, "");
    const payload = JSON.parse(text);
    for (const entry of payload?.entries || []) {
      if (
        entry?.key &&
        entry?.value &&
        Date.now() - Number(entry.createdAt) <= CACHE_TTL_MS
      ) {
        cache.set(entry.key, { value: entry.value, createdAt: Number(entry.createdAt) });
      }
    }
  } catch {
    // 首次启动或缓存损坏时从空缓存继续。
  }
}

function persistCache() {
  try {
    mkdirSync(path.dirname(cacheFile), { recursive: true });
    const temporary = `${cacheFile}.tmp`;
    const entries = [...cache.entries()].map(([key, entry]) => ({ key, ...entry }));
    writeFileSync(temporary, JSON.stringify({ entries }), "utf8");
    renameSync(temporary, cacheFile);
  } catch (error) {
    console.warn("[zhilu] cache persistence skipped:", error?.message || error);
  }
}

loadCache();

function getCached(key) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}

function setCached(key, value) {
  if (cache.size >= 30) cache.delete(cache.keys().next().value);
  cache.set(key, { value, createdAt: Date.now() });
  if (value?.mode === "live") persistCache();
}

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  app.use(express.static(publicDir));

  app.get("/api/health", (req, res) => {
    const llm = getLlmClient();
    res.json({
      status: "ok",
      service: "zhilu-mvp",
      version: "0.1.0",
      dataMode: currentDataMode(),
      llmConfigured: llm.configured,
      llmModel: llm.configured ? llm.model : null,
      llmConfigurationIssue: llm.configurationIssue,
      timestamp: new Date().toISOString()
    });
  });

  app.post("/api/explore", async (req, res, next) => {
    const startedAt = Date.now();
    try {
      const cacheKey = exploreCacheKey(currentDataMode(), req.body?.question);
      const cached = getCached(cacheKey);
      if (cached) {
        return res.json({
          ...cached,
          meta: { cached: true, processingMs: Date.now() - startedAt }
        });
      }

      const result = await exploreQuestion(req.body?.question);
      setCached(cacheKey, result);
      return res.json({
        ...result,
        meta: { cached: false, processingMs: Date.now() - startedAt }
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/icebreakers", (req, res, next) => {
    try {
      return res.json(buildIcebreakers(req.body || {}));
    } catch (error) {
      return next(error);
    }
  });

  app.use("/api", (req, res) => {
    res.status(404).json({
      status: "failed",
      code: "NOT_FOUND",
      message: "接口不存在。"
    });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = Number(error?.status) || 500;
    const safeStatus = status >= 400 && status < 600 ? status : 500;
    if (safeStatus >= 500) console.error("[zhilu] request failed:", error?.message || error);
    return res.status(safeStatus).json({
      status: "failed",
      code: error?.code || "INTERNAL_ERROR",
      message: safeStatus >= 500 ? "服务暂时不可用，请稍后重试。" : error.message,
      fallbackAvailable: currentDataMode() === "live"
    });
  });

  return app;
}
