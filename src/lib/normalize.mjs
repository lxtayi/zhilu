import { shorten, stableId, stripHtml } from "./text.mjs";

function pick(object, ...keys) {
  for (const key of keys) {
    if (object?.[key] !== undefined && object?.[key] !== null) {
      return object[key];
    }
  }
  return undefined;
}

export function extractItems(payload) {
  if (Array.isArray(payload)) return payload;
  return (
    payload?.Data?.Items ??
    payload?.data?.items ??
    payload?.Data ??
    payload?.data ??
    []
  );
}

export function normalizeZhihuItem(raw, sourceQuery) {
  const title = stripHtml(pick(raw, "Title", "title") || "未命名内容");
  const contentText = stripHtml(
    pick(raw, "ContentText", "contentText", "content", "excerpt", "summary") || ""
  );
  const url = String(pick(raw, "Url", "url") || "").trim();
  const upstreamId = String(pick(raw, "ContentID", "contentId", "id") || "").trim();
  const id = upstreamId ? `content_${upstreamId}` : stableId("content", url || `${title}:${contentText}`);
  const authorName = stripHtml(pick(raw, "AuthorName", "authorName", "author") || "知乎用户");

  return {
    id,
    upstreamId,
    title,
    contentType: String(pick(raw, "ContentType", "contentType", "type") || "Content"),
    excerpt: shorten(contentText, 260),
    authorName,
    authorId: stableId("author", `${authorName}:${pick(raw, "AuthorAvatar", "authorAvatar") || ""}`),
    authorAvatar: String(pick(raw, "AuthorAvatar", "authorAvatar") || ""),
    authorBadge: stripHtml(pick(raw, "AuthorBadgeText", "authorBadgeText", "AuthorBadge", "authorBadge") || ""),
    url,
    voteUpCount: Number(pick(raw, "VoteUpCount", "voteUpCount") || 0),
    commentCount: Number(pick(raw, "CommentCount", "commentCount") || 0),
    authorityLevel: String(pick(raw, "AuthorityLevel", "authorityLevel") || ""),
    rankingScore: Number(pick(raw, "RankingScore", "rankingScore") || 0),
    sourceQuery,
    isSynthetic: false
  };
}

export function dedupeContents(items) {
  const byKey = new Map();

  for (const item of items) {
    const key = item.upstreamId || item.url || `${item.title}:${item.authorName}`;
    const current = byKey.get(key);

    if (!current || item.rankingScore > current.rankingScore) {
      byKey.set(key, item);
    }
  }

  return [...byKey.values()].sort((a, b) => {
    const scoreA = a.rankingScore * 100 + Math.log10(a.voteUpCount + 1) * 2;
    const scoreB = b.rankingScore * 100 + Math.log10(b.voteUpCount + 1) * 2;
    return scoreB - scoreA;
  });
}
