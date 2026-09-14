import { readFileSync } from "node:fs";

const localConfigUrl = new URL("../../llm.local.json", import.meta.url);
const clean = (value) => typeof value === "string" ? value.trim() : "";

/**
 * Server-only configuration. Credentials stay inside the request closure.
 * Any LLM environment setting selects the entire environment configuration;
 * otherwise read the ignored local JSON file. Never merge credential sources.
 */
export function getLlmClient() {
  let values;
  if (["LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL", "LLM_REASONING_EFFORT"].some((key) => process.env[key] !== undefined)) {
    values = {
      apiKey: process.env.LLM_API_KEY,
      baseUrl: process.env.LLM_BASE_URL,
      model: process.env.LLM_MODEL,
      reasoningEffort: process.env.LLM_REASONING_EFFORT
    };
  } else {
    try {
      values = JSON.parse(readFileSync(localConfigUrl, "utf8").replace(/^\uFEFF/u, ""));
    } catch {
      // Missing, unreadable or malformed local configuration enables fallback.
      values = {};
    }
  }

  const apiKey = clean(values?.apiKey);
  const baseUrl = clean(values?.baseUrl);
  const model = clean(values?.model);
  const missingFields = [
    !apiKey && "LLM_API_KEY",
    !baseUrl && "LLM_BASE_URL",
    !model && "LLM_MODEL"
  ].filter(Boolean);
  const requestedEffort = clean(values?.reasoningEffort);
  const supportsEffort = /^(?:gpt-6-astra|o4-mini)(?:$|-)/.test(model);
  const reasoningEffort = supportsEffort
    ? (["low", "medium"].includes(requestedEffort) ? requestedEffort : "low")
    : undefined;
  let endpoint;
  if (apiKey && baseUrl && model) {
    try {
      const url = new URL(`${baseUrl.replace(/\/+$/, "")}/chat/completions`);
      if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password &&
          !url.search && !url.hash) endpoint = url;
    } catch {
      // Do not expose configuration values or parser errors.
    }
  }

  return Object.freeze({
    model,
    reasoningEffort,
    configured: Boolean(endpoint),
    configurationIssue: missingFields.length
      ? { code: "MISSING_LLM_CONFIG", fields: missingFields }
      : (!endpoint ? { code: "INVALID_LLM_BASE_URL", fields: ["LLM_BASE_URL"] } : null),
    request(body, { signal } = {}) {
      if (!endpoint) throw new Error("LLM service is not configured.");
      return fetch(endpoint, {
        method: "POST",
        redirect: "error",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, model }),
        signal
      });
    }
  });
}
