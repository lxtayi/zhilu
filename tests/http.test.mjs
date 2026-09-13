import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

import { createApp } from "../src/app.mjs";

process.env.ZHIHU_DATA_MODE = "demo";

async function withServer(run) {
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("首页和健康检查可访问", async () => {
  await withServer(async (baseUrl) => {
    const [page, health] = await Promise.all([
      fetch(baseUrl).then((response) => response.text()),
      fetch(`${baseUrl}/api/health`).then((response) => response.json())
    ]);

    assert.match(page, /知路/);
    assert.equal(health.status, "ok");
    assert.equal(health.dataMode, "demo");
  });
});

test("探索接口跑通完整结果合同", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/explore`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "我要不要从大厂离职去创业？" })
    });
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.status, "succeeded");
    assert.equal(result.clusters.length, 4);
    assert.ok(result.clusters[0].people[0].connectionReason);
    assert.equal(result.meta.cached, false);
  });
});

test("探索接口拒绝空问题", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/explore`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "" })
    });
    const result = await response.json();

    assert.equal(response.status, 400);
    assert.equal(result.code, "QUESTION_REQUIRED");
  });
});
