import { firstSentence, shorten, stableId } from "./text.mjs";

const CLUSTER_DEFINITIONS = [
  {
    id: "opportunity",
    name: "机会远望岛",
    shortName: "远望",
    color: "#4f5e3c",
    summary: "关注选择可能带来的新增价值、成长空间和趋势机会。",
    keywords: ["值得", "机会", "优势", "增长", "成长", "趋势", "前景", "价值"]
  },
  {
    id: "capability",
    name: "能力底牌岛",
    shortName: "底牌",
    color: "#6f7652",
    summary: "讨论做成这件事需要的能力、门槛和适用条件。",
    keywords: ["能力", "要求", "条件", "基础", "用户", "产品", "商业", "技术", "门槛"]
  },
  {
    id: "risk",
    name: "风险校准岛",
    shortName: "风险",
    color: "#9b6b35",
    summary: "提醒识别动机、转换成本、失败可能和被忽略的代价。",
    keywords: ["风险", "成本", "焦虑", "失败", "放弃", "薪资", "后悔", "问题", "不要"]
  },
  {
    id: "path",
    name: "行动启程岛",
    shortName: "启程",
    color: "#52686a",
    summary: "提供试验、过渡、学习和下一步行动的具体路线。",
    keywords: ["路径", "建议", "方法", "步骤", "尝试", "先", "转型", "实践", "如何"]
  }
];

function scoreDefinition(item, definition) {
  const haystack = `${item.title} ${item.excerpt}`.toLowerCase();
  return definition.keywords.reduce(
    (score, keyword) => score + (haystack.includes(keyword.toLowerCase()) ? 1 : 0),
    0
  );
}

function chooseCluster(item, index) {
  const scores = CLUSTER_DEFINITIONS.map((definition) => scoreDefinition(item, definition));
  const max = Math.max(...scores);
  return max === 0 ? index % CLUSTER_DEFINITIONS.length : scores.indexOf(max);
}

function buildPerson(item, definition, question) {
  const quote = firstSentence(item.excerpt || item.title, 96);
  const evidenceTitle = shorten(item.title, 42);

  return {
    id: item.authorId || stableId("author", item.authorName),
    name: item.authorName || "知乎用户",
    avatar: item.authorAvatar || "",
    headline: item.authorBadge || "相关内容作者",
    recommendationType: definition.id === "risk" ? "值得追问" : "观点互补",
    viewpoint: `从公开内容《${evidenceTitle}》看，TA 从“${definition.shortName}”角度讨论了这个问题。`,
    connectionReason: `你正在关注“${shorten(question, 36)}”。TA 有直接相关的公开内容，可以围绕原文中的具体判断继续交流。`,
    quote: {
      text: quote || `这篇内容围绕“${question}”展开讨论。`,
      evidenceId: item.id,
      isExcerpt: true
    },
    evidenceIds: [item.id]
  };
}

export function clusterContents(items, question) {
  const buckets = CLUSTER_DEFINITIONS.map((definition) => ({
    ...definition,
    evidenceIds: [],
    people: [],
    contentCount: 0
  }));

  items.forEach((item, index) => {
    const cluster = buckets[chooseCluster(item, index)];
    cluster.contentCount += 1;
    if (cluster.evidenceIds.length < 4) cluster.evidenceIds.push(item.id);

    if (
      cluster.people.length < 3 &&
      !cluster.people.some((person) => person.id === item.authorId)
    ) {
      cluster.people.push(buildPerson(item, cluster, question));
    }
  });

  const nonEmpty = buckets.filter((cluster) => cluster.contentCount > 0);
  return nonEmpty.length === CLUSTER_DEFINITIONS.length
    ? nonEmpty
    : redistribute(items, question);
}

function redistribute(items, question) {
  const selected = CLUSTER_DEFINITIONS;
  const buckets = selected.map((definition) => ({
    ...definition,
    evidenceIds: [],
    people: [],
    contentCount: 0
  }));

  items.forEach((item, index) => {
    const cluster = buckets[index % buckets.length];
    cluster.contentCount += 1;
    cluster.evidenceIds.push(item.id);
    if (!cluster.people.some((person) => person.id === item.authorId)) {
      cluster.people.push(buildPerson(item, cluster, question));
    }
  });

  return buckets.filter((cluster) => cluster.contentCount > 0);
}

export function clusterDefinitions() {
  return CLUSTER_DEFINITIONS.map(({ keywords, ...definition }) => definition);
}
