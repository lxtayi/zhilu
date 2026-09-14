
function cleanQuestion(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function shorten(value, length = 120) {
  const text = stripHtml(value);
  return text.length > length ? `${text.slice(0, length).trim()}…` : text;
}

function firstSentence(value, length = 96) {
  const text = stripHtml(value);
  const sentence = text.split(/(?<=[。！？!?])/u)[0] || text;
  return shorten(sentence, length);
}

function stableId(prefix,value){let h=0;for(const c of String(value))h=(Math.imul(h,31)+c.charCodeAt(0))|0;return prefix+'_'+(h>>>0).toString(16);}
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


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

function clusterContents(items, question) {
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

function clusterDefinitions() {
  return CLUSTER_DEFINITIONS.map(({ keywords, ...definition }) => definition);
}


function buildQuestionAnalysis(input) {
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


const PERSONAS = [
  {
    name: "知友·实践派",
    headline: "演示画像｜关注真实经验",
    viewpoint: "更关心选择能否在真实场景里创造新增价值。",
    quote: "先找到一个足够小的真实问题，用结果检验自己是否真的喜欢这条路。"
  },
  {
    name: "知友·能力派",
    headline: "演示画像｜关注能力结构",
    viewpoint: "认为兴趣只是起点，长期适配还取决于能力组合和工作方式。",
    quote: "不要只比较岗位名称，要比较每天实际需要完成的工作。"
  },
  {
    name: "知友·校准派",
    headline: "演示画像｜关注决策代价",
    viewpoint: "提醒先识别真实动机，再评估转换成本和不可逆部分。",
    quote: "厌倦现在的状态，并不自动等于适合另一个方向。"
  },
  {
    name: "知友·路径派",
    headline: "演示画像｜关注低成本验证",
    viewpoint: "主张先用项目、访谈和短期实践验证，再决定是否完全切换。",
    quote: "先做一次两周实验，比继续想象新方向更容易得到答案。"
  }
];

function buildDemoExploreResult(question, analysis) {
  const definitions = clusterDefinitions();
  const evidence = definitions.map((definition, index) => ({
    id: `demo_content_${index + 1}`,
    upstreamId: "",
    title: `演示内容：从${definition.shortName}角度看“${shorten(question, 28)}”`,
    contentType: "Demo",
    excerpt: PERSONAS[index].quote,
    authorName: PERSONAS[index].name,
    authorId: stableId("demo_author", PERSONAS[index].name),
    authorAvatar: "",
    authorBadge: PERSONAS[index].headline,
    url: `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(question)}`,
    voteUpCount: 0,
    commentCount: 0,
    authorityLevel: "",
    rankingScore: 0,
    sourceQuery: analysis.searchQueries[index] || question,
    isSynthetic: true
  }));

  const clusters = definitions.map((definition, index) => {
    const item = evidence[index];
    const persona = PERSONAS[index];
    return {
      ...definition,
      contentCount: 1,
      evidenceIds: [item.id],
      people: [
        {
          id: item.authorId,
          name: persona.name,
          avatar: "",
          headline: persona.headline,
          recommendationType: index === 2 ? "值得追问" : "观点互补",
          viewpoint: persona.viewpoint,
          connectionReason: `你正在思考“${shorten(question, 36)}”。这个演示画像能从${definition.shortName}角度补充你的判断。`,
          quote: {
            text: persona.quote,
            evidenceId: item.id,
            isExcerpt: true
          },
          evidenceIds: [item.id]
        }
      ]
    };
  });

  return {
    question,
    analysis,
    clusters,
    evidence,
    status: "succeeded",
    mode: "demo",
    warnings: [
      {
        code: "DEMO_MODE",
        message: "当前使用明确标注的演示数据；配置知乎 Access Secret 后可切换为真实搜索。"
      }
    ]
  };
}

function buildIcebreakers({ question, person, evidence }) {
  const clean = String(question);
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

// Allow the live search + semantic classification pipeline to complete before fallback.
const EXPLORE_TIMEOUT_MS = 45000;

async function staticApi(path, options = {}) {
  const endpoint = path.split("?")[0].split("/").pop();
  if (!["health", "explore", "icebreakers"].includes(endpoint)) return fetch(path, options);
  let reason = "当前通过本地文件打开，无法连接真实数据接口；已使用明确标注的演示数据。";
  if (options.signal?.aborted) throw new DOMException("请求已取消。", "AbortError");
  if (window.location.protocol !== "file:") {
    const controller = new AbortController();
    const timeoutMs = endpoint === "explore" ? EXPLORE_TIMEOUT_MS : endpoint === "health" ? 8000 : 15000;
    let timedOut = false;
    let timer;
    const cancel = () => controller.abort();
    options.signal?.addEventListener("abort", cancel, { once: true });
    try {
      const request = (async () => {
        const response = await fetch(path, { ...options, signal: controller.signal });
        // Invalid input, authorization and rate limits must remain errors, not fake successes.
        if (response.status >= 400 && response.status < 500) return response;
        if (!response.ok) {
          reason = "真实数据接口返回 HTTP " + response.status + "，已回退演示数据。";
          return null;
        }
        // Include response-body loading in the deadline, not only response headers.
        const data = await response.json();
        return { ok: true, status: response.status, json: async () => data };
      })();
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new DOMException("请求超时。", "TimeoutError"));
        }, timeoutMs);
      });
      const result = await Promise.race([request, deadline]);
      if (result) return result;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      reason = timedOut
        ? "真实数据请求等待 " + timeoutMs / 1000 + " 秒后超时，已回退演示数据。"
        : error?.name === "SyntaxError"
          ? "真实数据接口返回了无效的数据格式，已回退演示数据。"
          : "无法连接真实数据服务（网络或服务异常），已回退演示数据。";
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
    }
  }
  const input = JSON.parse(options.body || "{}");
  const warnings = [{ code: "STATIC_FALLBACK", message: reason }];
  let data;
  if (endpoint === "health") data = { dataMode: "demo", warnings };
  else if (endpoint === "icebreakers") data = { ...buildIcebreakers(input), warnings };
  else data = { ...buildDemoExploreResult(input.question, buildQuestionAnalysis(input.question)), mode: "fallback", warnings };
  return { ok: true, status: 200, json: async () => data };
}
