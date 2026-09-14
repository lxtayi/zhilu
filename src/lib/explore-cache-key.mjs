import { getLlmClient } from "../config/llm.mjs";
import { CLASSIFICATION_VERSION } from "../services/llm-clustering.mjs";

export function exploreCacheKey(mode, question, client = getLlmClient(), version = CLASSIFICATION_VERSION) {
  return JSON.stringify([
    mode, client.model, version, client.reasoningEffort || "default",
    client.configured, String(question || "").trim()
  ]);
}
