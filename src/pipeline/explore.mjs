import { buildQuestionAnalysis } from "../lib/search-queries.mjs";
import { clusterContents, themeFallbackClusters } from "../lib/clusters.mjs";
import { dedupeContents } from "../lib/normalize.mjs";
import { cleanQuestion } from "../lib/text.mjs";
import {
  hasZhihuSearchCredential,
  searchManyZhihu
} from "../services/zhihu.mjs";
import { buildDemoExploreResult } from "./demo.mjs";

export class InputError extends Error {
  constructor(message, code = "QUESTION_INVALID") {
    super(message);
    this.name = "InputError";
    this.code = code;
    this.status = 400;
  }
}

export function validateQuestion(input) {
  const question = cleanQuestion(input);
  if (!question) throw new InputError("请输入一个真实问题。", "QUESTION_REQUIRED");
  if (question.length < 5) throw new InputError("问题至少需要 5 个字符。", "QUESTION_TOO_SHORT");
  if (question.length > 100) throw new InputError("问题请控制在 100 个字符以内。", "QUESTION_TOO_LONG");
  return question;
}

export function currentDataMode() {
  const requested = String(process.env.ZHIHU_DATA_MODE || "auto").toLowerCase();
  if (requested === "demo") return "demo";
  return hasZhihuSearchCredential() ? "live" : "demo";
}

export async function exploreQuestion(input) {
  const question = validateQuestion(input);
  const analysis = buildQuestionAnalysis(question);

  if (currentDataMode() === "demo") {
    return buildDemoExploreResult(question, analysis);
  }

  // 赛事账号额度较小。每个问题只请求一次知乎搜索，随后批量分类。
  const { items: rawItems, warnings } = await searchManyZhihu(analysis.searchQueries.slice(0, 1));
  const evidence = dedupeContents(rawItems).slice(0, 24);

  if (evidence.length < 4) {
    const fallback = buildDemoExploreResult(question, analysis);
    return {
      ...fallback,
      mode: "fallback",
      warnings: [
        ...warnings,
        {
          code: "INSUFFICIENT_CONTENT",
          message: "真实搜索结果不足，已切换到演示数据保证流程可用。"
        }
      ]
    };
  }

  const { classifyContents } = await import("../services/llm-clustering.mjs");
  const classification = await classifyContents({
    question,
    items: evidence.map(({ id, title, excerpt }) => ({ id, title, excerpt }))
  });
  const combinedWarnings = [...warnings, ...classification.warnings];

  return {
    question,
    analysis,
    clusters: classification.status === "succeeded"
      ? clusterContents(evidence, question, { dynamicIslands: classification.islands })
      : themeFallbackClusters(question, clusterContents(evidence, question)),
    evidence,
    status: combinedWarnings.length || classification.status !== "succeeded" ? "partial" : "succeeded",
    mode: "live",
    warnings: combinedWarnings
  };
}

export function buildIcebreakers({ question, person, evidence }) {
  const clean = validateQuestion(question);
  if (!person?.name || !person?.quote?.text) {
    throw new InputError("缺少人物或原话证据。", "PERSON_REQUIRED");
  }

  const quote = person.quote.text;
  const evidenceTitle = evidence?.title ? `《${evidence.title}》` : "相关内容";

  return {
    drafts: [
      {
        style: "ask",
        label: "求教风",
        text: `你好，看到你在${evidenceTitle}中提到“${quote}”。我最近也在思考“${clean}”，想请教你是用什么标准做判断的？`
      },
      {
        style: "resonate",
        label: "共鸣风",
        text: `你写的“${quote}”让我很有共鸣。我也在面对“${clean}”这个问题。后来有没有哪段经历让你的判断发生变化？`
      },
      {
        style: "challenge",
        label: "挑战风",
        text: `关于“${quote}”，我想到一个不同情境：如果现实约束更强，这个判断还成立吗？我正在思考“${clean}”，很想听听你会如何划定边界。`
      }
    ],
    evidenceIds: person.evidenceIds || [],
    requiresUserReview: true
  };
}
