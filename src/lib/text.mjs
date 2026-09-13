import crypto from "node:crypto";

export function cleanQuestion(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripHtml(value) {
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

export function shorten(value, length = 120) {
  const text = stripHtml(value);
  return text.length > length ? `${text.slice(0, length).trim()}…` : text;
}

export function firstSentence(value, length = 96) {
  const text = stripHtml(value);
  const sentence = text.split(/(?<=[。！？!?])/u)[0] || text;
  return shorten(sentence, length);
}

export function stableId(prefix, value) {
  const digest = crypto
    .createHash("sha1")
    .update(String(value ?? ""))
    .digest("hex")
    .slice(0, 12);
  return `${prefix}_${digest}`;
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
