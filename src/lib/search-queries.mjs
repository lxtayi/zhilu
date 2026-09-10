import { cleanQuestion } from "./text.mjs";

export function buildQuestionAnalysis(input) {
  const originalQuestion = cleanQuestion(input);
  const topic = originalQuestion.replace(/[？?。！!]+$/u, "");

  const searchQueries = [
    topic,
    `${topic} 真实经验`,
    `${topic} 风险 成本`,
    `${topic} 能力 条件`,
    `${topic} 路径 建议`
  ].filter((query, index, list) => query && list.indexOf(query) === index);

  return {
    topic,
    coreTension: `围绕“${topic}”比较机会、条件、风险和行动路径`,
    searchQueries: searchQueries.slice(0, 5),
    dimensions: ["机会与价值", "能力与条件", "风险与成本", "行动路径"]
  };
}
