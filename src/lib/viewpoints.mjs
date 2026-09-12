import { shorten, stripHtml } from "./text.mjs";

function extractStrikingText(value) {
  const clean = stripHtml(value).replace(/^[\s·•-]+/u, "");
  const candidates = clean
    .split(/[。！？!?；;，,]/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 10);
  const stance = /(更重要|应该|不是|就是|宁愿|只有|没有|我认为|答案|关键|先|真正|可以|不能|值得|不值得|自由|爱情|爱)/u;
  const selected = candidates.find((part) => stance.test(part)) || candidates[0] || clean;
  return shorten(selected, 58);
}

export function buildViewpoints(evidence, clusters = []) {
  const seen = new Set();
  return evidence
    .map((item) => {
      const text = extractStrikingText(item.excerpt || item.title);
      const normalized = text.replace(/[“”"‘’'，。！？、：；\s]/gu, "");
      if (!text || normalized.length < 8 || seen.has(normalized)) return null;
      seen.add(normalized);
      const clusterIndex = clusters.findIndex((cluster) => cluster.evidenceIds?.includes(item.id));
      return {
        id: item.id,
        text,
        author: {
          id: item.authorId,
          name: item.authorName || "知乎用户",
          avatar: item.authorAvatar || "",
          headline: item.authorBadge || "相关内容作者"
        },
        evidenceId: item.id,
        url: item.url,
        clusterIndex: clusterIndex >= 0 ? clusterIndex : 0,
        voteUpCount: item.voteUpCount || 0,
        contentType: item.contentType || "Content",
        isSynthetic: Boolean(item.isSynthetic)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.voteUpCount - a.voteUpCount)
    .slice(0, 8);
}
