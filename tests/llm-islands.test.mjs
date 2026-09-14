import test from "node:test";
import assert from "node:assert/strict";
import { classifyContents } from "../src/services/llm-clustering.mjs";
import { clusterContents, clusterDefinitions } from "../src/lib/clusters.mjs";
import { exploreCacheKey } from "../src/lib/explore-cache-key.mjs";
import { getLlmClient } from "../src/config/llm.mjs";

function mockModel(t, islands) {
  const keys = ["LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL", "LLM_REASONING_EFFORT"];
  const previous = keys.map((key) => process.env[key]);
  t.after(() => keys.forEach((key, index) => {
    if (previous[index] === undefined) delete process.env[key];
    else process.env[key] = previous[index];
  }));
  process.env.LLM_API_KEY = "test-only";
  process.env.LLM_BASE_URL = "https://model.invalid/v1";
  process.env.LLM_MODEL = "test-model";
  delete process.env.LLM_REASONING_EFFORT;
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ islands }) } }]
  })));
}

function fixture(count) {
  const items = Array.from({ length: count }, (_, i) => ({
    id: `content_${i}`, title: "实践建议", excerpt: "先验证。再行动。",
    authorId: `author_${i}`, authorName: `作者${i}`
  }));
  // The most important island deliberately does not have the smallest ID.
  const islands = items.map((item, i) => ({
    id: `topic_${count - i}`, name: `主题${i}`, summary: "讨论实践中的选择。",
    evidenceIds: [item.id]
  }));
  return { items, islands, question: "如何规划职业发展？" };
}

for (const count of [2, 5, 8]) {
  test(`${count} 个候选岛保留前 ${Math.min(count, 5)} 个且证据完整`, async (t) => {
    const { items, islands, question } = fixture(count);
    const original = structuredClone(islands);
    mockModel(t, islands);
    const result = await classifyContents({ question, items });
    assert.equal(result.status, "succeeded");
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.islands.map(({ id }) => id), islands.slice(0, 5).map(({ id }) => id));
    assert.deepEqual(result.islands.map(({ name }) => name), islands.slice(0, 5).map(({ name }) => name));
    const evidenceIds = result.islands.flatMap((island) => island.evidenceIds);
    assert.deepEqual([...evidenceIds].sort(), items.map(({ id }) => id).sort());
    assert.equal(new Set(evidenceIds).size, items.length);
    if (count <= 5) assert.deepEqual(result.islands, islands);
    else {
      assert.deepEqual(result.islands.slice(0, 4), islands.slice(0, 4));
      assert.deepEqual(result.islands[4].evidenceIds, items.slice(4).map(({ id }) => id));
      assert.match(result.islands[4].summary, /补充观点/);
    }
    assert.deepEqual(islands, original);
    const clusters = clusterContents(items, question, { dynamicIslands: result.islands });
    assert.equal(clusters.length, Math.min(count, 5));
    assert.equal(clusters.reduce((sum, cluster) => sum + cluster.contentCount, 0), items.length);
    for (const cluster of clusters) {
      assert.match(cluster.color, /^#[0-9a-f]{6}$/i);
      for (const person of cluster.people) {
        assert.ok(cluster.evidenceIds.includes(person.quote.evidenceId));
        assert.equal(person.quote.text, "先验证。");
      }
    }
  });
}

test("截取前先验证全部候选岛，低优先级无效证据仍触发失败", async (t) => {
  const { items, islands, question } = fixture(8);
  islands[7].evidenceIds = ["unknown"];
  mockModel(t, islands);
  const result = await classifyContents({ question, items });
  assert.equal(result.status, "failed");
  assert.deepEqual(result.islands, []);
  assert.deepEqual(clusterContents(items, question).map(({ id }) => id), clusterDefinitions().map(({ id }) => id));
});

test("收敛后的简介仍遵守长度限制", async (t) => {
  const { items, islands, question } = fixture(8);
  islands[4].summary = "观".repeat(160);
  mockModel(t, islands);
  const result = await classifyContents({ question, items });
  assert.equal(result.status, "succeeded");
  assert.ok(result.islands[4].summary.length <= 160);
  assert.match(result.islands[4].summary, /补充观点/);
});

test("JSON 网关兼容、短输入与无模型岛 ID 的完整响应", async (t) => {
  const { items, islands, question } = fixture(10);
  items[0].excerpt = "真实观点".repeat(100);
  items[0].title = "标题".repeat(100);
  mockModel(t, islands);
  process.env.LLM_MODEL = "o4-mini";
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const body = JSON.parse(options.body);
    const user = body.messages.find(m => m.role === "user").content;
    assert.match(user, /JSON/i);
    const input = JSON.parse(user.slice(user.indexOf("{")));
    assert.equal(input.items.length, 10);
    assert.deepEqual(Object.keys(input.items[0]).sort(), ["excerpt", "id", "title"]);
    assert.equal(input.items[0].excerpt.length, 160);
    assert.equal(input.items[0].title.length, 100);
    assert.equal(body.reasoning_effort, "low");
    assert.equal(body.max_completion_tokens, 4096);
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: {
      content: JSON.stringify({ islands: [{name: "实践", summary: "先验证。", evidenceIds: items.map(i => i.id)}] })
    } }] }));
  });
  const result = await classifyContents({question, items});
  assert.equal(result.status, "succeeded");
  assert.equal(result.islands[0].id, "island_1");
  assert.equal(result.islands[0].evidenceIds.length, 10);
  assert.equal(items[0].excerpt.length, 400);
});

for (const bad of ["missing", "duplicate", "unknown"]) {
  test(`无岛 ID 的响应仍拒绝 ${bad} 证据`, async (t) => {
    const {items, question} = fixture(3);
    const ids = items.map(i => i.id);
    if (bad === "missing") ids.pop();
    if (bad === "duplicate") ids.push(ids[0]);
    if (bad === "unknown") ids.push("not-input");
    mockModel(t, [{name: "主题", summary: "简介。", evidenceIds: ids}]);
    const result = await classifyContents({question, items});
    assert.equal(result.status, "failed");
    assert.equal(result.warnings[0].code, "LLM_INVALID_RESPONSE");
  });
}

test("HTTP 错误保留状态码而不回传提供商错误正文", async (t) => {
  mockModel(t, []);
  t.mock.method(globalThis, "fetch", async () => new Response("private-upstream-details", {status: 400}));
  const result = await classifyContents(fixture(2));
  assert.equal(result.warnings[0].code, "LLM_REQUEST_FAILED");
  assert.match(result.warnings[0].message, /HTTP 400/);
  assert.doesNotMatch(JSON.stringify(result), /private-upstream/);
});

test("JSON 解析失败和 token 截断保留 fallback", async (t) => {
  mockModel(t, []);
  for (const [finish, content] of [["stop", "not-json"], ["length", "{}"]]) {
    t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({choices:[{finish_reason:finish,message:{content}}]})));
    const result = await classifyContents(fixture(2));
    assert.equal(result.warnings[0].code, "LLM_INVALID_RESPONSE");
    assert.deepEqual(result.islands, []);
  }
});

test("请求取消区分本地 timeout 与调用方取消", async (t) => {
  mockModel(t, []);
  t.mock.method(globalThis, "fetch", (_url, {signal}) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {once:true});
  }));
  const result = await classifyContents(fixture(2), {timeoutMs: 5});
  assert.equal(result.warnings[0].code, "LLM_TIMEOUT");
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(classifyContents(fixture(2), {signal: controller.signal}), {name:"AbortError"});
});

test("未确认的模型不附加 reasoning 参数", async (t) => {
  mockModel(t, []);
  process.env.LLM_MODEL = "deepseek-v4-flash";
  process.env.LLM_REASONING_EFFORT = "low";
  assert.equal(getLlmClient().reasoningEffort, undefined);
});

test("缓存隔离模型、分类版本、推理档位和配置状态", () => {
  const client = {model:"o4-mini", reasoningEffort:"low", configured:true};
  const original = exploreCacheKey("live", "问题", client, "v1");
  for (const changes of [{model:"deepseek-v4-flash"}, {reasoningEffort:"medium"}, {configured:false}]) {
    assert.notEqual(exploreCacheKey("live", "问题", {...client,...changes}, "v1"), original);
  }
  assert.notEqual(exploreCacheKey("live", "问题", client, "v2"), original);
  assert.notEqual(original, "live:问题");
  assert.equal(exploreCacheKey("live", " 问题 ", client, "v1"), original);
});
