import test from "node:test";
import assert from "node:assert/strict";

import { buildQuestionAnalysis } from "../src/lib/search-queries.mjs";
import { dedupeContents } from "../src/lib/normalize.mjs";
import {
  buildIcebreakers,
  exploreQuestion,
  validateQuestion
} from "../src/pipeline/explore.mjs";

process.env.ZHIHU_DATA_MODE = "demo";

test("问题分析会生成覆盖不同决策维度的搜索词", () => {
  const result = buildQuestionAnalysis("裸辞去做独立开发者靠谱吗？");

  assert.equal(result.searchQueries.length, 5);
  assert.ok(result.searchQueries.some((query) => query.includes("风险")));
  assert.ok(result.searchQueries.some((query) => query.includes("能力")));
});

test("问题输入有明确的长度边界", () => {
  assert.throws(() => validateQuestion("想不想"), /至少需要 5 个字符/);
  assert.equal(validateQuestion("我要不要从大厂离职去创业？"), "我要不要从大厂离职去创业？");
});

test("内容去重保留评分更高的同一条证据", () => {
  const evidence = dedupeContents([
    { upstreamId: "42", title: "旧版本", rankingScore: 0.2, voteUpCount: 10 },
    { upstreamId: "42", title: "高质量版本", rankingScore: 0.9, voteUpCount: 20 }
  ]);

  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].title, "高质量版本");
});

test("演示模式完整返回观点岛、人物和证据", async () => {
  const result = await exploreQuestion("我要不要从大厂离职去创业？");

  assert.equal(result.mode, "demo");
  assert.equal(result.clusters.length, 4);
  assert.ok(result.evidence.length >= 4);
  assert.ok(result.clusters.every((cluster) => cluster.people.length >= 1));
  assert.ok(result.clusters.every((cluster) => cluster.people[0].evidenceIds.length >= 1));
});

test("真实内容归类始终形成四座可探索岛屿", async () => {
  const { clusterContents } = await import("../src/lib/clusters.mjs");
  const items = Array.from({ length: 8 }, (_, index) => ({
    id: `content_${index}`,
    authorId: `author_${index}`,
    authorName: `作者${index}`,
    title: "围绕同一主题的真实经验",
    excerpt: "先从一个小项目开始验证，再考虑下一步。"
  }));

  const clusters = clusterContents(items, "技术转 AI 产品值得吗？");
  assert.equal(clusters.length, 4);
  assert.ok(clusters.every((cluster) => cluster.people.length >= 1));
});

test("破冰器生成三种可编辑草稿并携带证据", () => {
  const result = buildIcebreakers({
    question: "我要不要从大厂离职去创业？",
    person: {
      name: "知友·实践派",
      quote: { text: "先用一个小项目验证是否有人愿意付费。" },
      evidenceIds: ["demo_1"]
    },
    evidence: { title: "离职创业前，我做了三个月验证" }
  });

  assert.deepEqual(result.drafts.map((draft) => draft.style), ["ask", "resonate", "challenge"]);
  assert.equal(result.requiresUserReview, true);
  assert.deepEqual(result.evidenceIds, ["demo_1"]);
});
