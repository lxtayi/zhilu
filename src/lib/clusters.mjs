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

const DYNAMIC_ISLAND_COLORS = [...CLUSTER_DEFINITIONS.map(({ color }) => color), "#786184"];

export function clusterContents(items, question, { dynamicIslands } = {}) {
  // Dynamic islands have already passed the service's whole-batch validation.
  if (dynamicIslands?.length) {
    return dynamicIslands.map((island, index) => {
      const memberIds = new Set(island.evidenceIds);
      const members = items.filter((item) => memberIds.has(item.id));
      const cluster = {
        id: `dynamic_${island.id}`,
        name: island.name,
        shortName: shorten(island.name, 12),
        color: DYNAMIC_ISLAND_COLORS[index % DYNAMIC_ISLAND_COLORS.length],
        summary: island.summary,
        keywords: [],
        evidenceIds: members.map((item) => item.id),
        people: [],
        contentCount: members.length
      };
      for (const item of members) {
        if (cluster.people.length < 3 && !cluster.people.some((person) => person.id === item.authorId)) {
          cluster.people.push(buildPerson(item, cluster, question));
        }
      }
      return cluster;
    });
  }

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

// First match wins: a concrete business/career goal takes precedence over learning.
const FALLBACK_DISPLAY_THEMES = [
  {
    pattern: /创业|创办|开店|独立开发|自己做生意/,
    definitions: {
      opportunity: { name: "创业机会岛", shortName: "机会", summary: "从需求与市场空间出发，探索创业可能带来的价值。" },
      capability: { name: "创业准备岛", shortName: "准备", summary: "梳理产品、团队和资源等创业所需的基础条件。" },
      risk: { name: "创业代价岛", shortName: "代价", summary: "关注资金投入、收入波动和试错成本，校准创业预期。" },
      path: { name: "起步验证岛", shortName: "验证", summary: "探索需求验证、小规模试验和逐步启动的行动路径。" }
    }
  },
  {
    // Match role + transition + destination, including spaced and lowercase AI.
    pattern: /转岗|转行|转型|换工作|跳槽|职业|求职|择业|改行|(?:技术|程序员|工程师|开发者|产品经理|设计师|运营)[^。！？!?，,；;\n]{0,12}?(?:转向|转做|转|进入|入行|投身)\s*(?:AI\b|AI(?=[\u4e00-\u9fff])|人工智能|大模型|产品(?:经理)?|算法(?:工程师)?)/i,
    definitions: {
      opportunity: { name: "职业机会岛", shortName: "机会", summary: "探索新岗位与职业方向可能带来的发展空间。" },
      capability: { name: "转型准备岛", shortName: "准备", summary: "梳理可迁移能力、经验积累和目标岗位所需的条件。" },
      risk: { name: "转型代价岛", shortName: "代价", summary: "关注收入变化、适应成本与职业转换中的不确定性。" },
      path: { name: "转型试探岛", shortName: "试探", summary: "探索岗位调研、项目实践和逐步过渡的行动路径。" }
    }
  },
  {
    pattern: /学习|成长|自学|进修|读书|考研|考证|培训|提升|学会|学好/,
    definitions: {
      opportunity: { name: "成长方向岛", shortName: "方向", summary: "探索学习目标、知识应用与个人成长的可能方向。" },
      capability: { name: "学习基础岛", shortName: "基础", summary: "梳理已有基础、学习资源和需要补齐的能力。" },
      risk: { name: "学习取舍岛", shortName: "取舍", summary: "关注时间投入、学习负担和目标选择中的取舍。" },
      path: { name: "实践进阶岛", shortName: "进阶", summary: "探索分步练习、实践反馈和持续积累的学习路径。" }
    }
  }
];

/** Return themed copies of fixed clusters without changing membership or people. */
export function themeFallbackClusters(question, clusters) {
  const theme = FALLBACK_DISPLAY_THEMES.find(({ pattern }) => pattern.test(String(question ?? "")));
  if (!theme) return clusters;
  return clusters.map((cluster) => {
    const display = Object.hasOwn(theme.definitions, cluster.id) ? theme.definitions[cluster.id] : null;
    return display ? { ...cluster, ...display } : cluster;
  });
}
