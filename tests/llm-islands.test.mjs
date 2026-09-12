import test from "node:test";
import assert from "node:assert/strict";
import { classifyContents } from "../src/services/llm-clustering.mjs";
import { clusterContents, clusterDefinitions } from "../src/lib/clusters.mjs";

function mockModel(t, islands) {
  const keys = ["LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL"];
  const previous = keys.map((key) => process.env[key]);
  t.after(() => keys.forEach((key, index) => {
    if (previous[index] === undefined) delete process.env[key];
    else process.env[key] = previous[index];
  }));
  process.env.LLM_API_KEY = "test-only";
  process.env.LLM_BASE_URL = "https://model.invalid/v1";
  process.env.LLM_MODEL = "test-model";
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
