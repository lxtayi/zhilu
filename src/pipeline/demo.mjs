import { clusterDefinitions } from "../lib/clusters.mjs";
import { shorten, stableId } from "../lib/text.mjs";

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

export function buildDemoExploreResult(question, analysis) {
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

  const viewpoints = clusters.map((cluster, index) => {
    const item = evidence[index];
    const persona = PERSONAS[index];
    return {
      id: item.id,
      text: persona.quote,
      author: { id: item.authorId, name: persona.name, avatar: "", headline: persona.headline },
      evidenceId: item.id,
      url: item.url,
      clusterIndex: index,
      voteUpCount: 0,
      contentType: "Demo",
      isSynthetic: true
    };
  });

  return {
    question,
    analysis,
    clusters,
    viewpoints,
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
