const fs = require("node:fs");
const path = require("node:path");
const douyinAuth = require("./douyin-auth");

function getLlmConfig(env = process.env) {
  const provider = String(env.LLM_PROVIDER || "deepseek").trim() || "deepseek";
  const apiKey = String(env.DEEPSEEK_API_KEY || env.MODEL_API_KEY || "").trim();
  const baseUrl = String(env.DEEPSEEK_BASE_URL || env.MODEL_BASE_URL || "").trim();
  const model = String(env.DEEPSEEK_MODEL || env.MODEL_NAME || "deepseek-chat").trim();
  return {
    provider,
    configured: Boolean(apiKey),
    model,
    baseUrl,
  };
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function loadAuntieRules(rootDir) {
  const candidates = [
    path.join(rootDir, "data", "fused-strategy.json"),
    path.join(rootDir, "data", "fused-strategy.md"),
  ];
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      if (filePath.endsWith(".json")) {
        const data = JSON.parse(raw);
        const latest = Array.isArray(data) ? data[data.length - 1] : data;
        const source = latest?.id || latest?.source || path.basename(filePath);
        const insight = latest?.insight || {};
        const hints = [
          ...(insight.rules || []),
          ...(insight.leadSignals || []),
          ...(insight.negativeHandling || []),
          ...(insight.replyStyle || []),
          ...(insight.avoid || []),
        ]
          .slice(0, 8)
          .map((item) => (typeof item === "string" ? item : item?.text || ""));
        return {
          source,
          hints: hints.filter(Boolean),
        };
      }
      return {
        source: path.basename(filePath),
        hints: raw
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 8),
      };
    } catch {
      return { source: path.basename(filePath), hints: [] };
    }
  }
  return { source: "", hints: [] };
}

function buildHealthPayload({ rootDir, env = process.env } = {}) {
  const auntieRules = loadAuntieRules(rootDir);
  return {
    ok: true,
    module: "douyin-comment-reply-agent",
    adapter: env.COMMENT_ADAPTER || "mock",
    appType: env.DOUYIN_APP_TYPE || "mini",
    configured: Boolean(douyinAuth.getAuthSnapshot(rootDir, env).accessToken),
    douyinAuth: douyinAuth.redactAuth(douyinAuth.getAuthSnapshot(rootDir, env)),
    requireManualApproval: parseBoolean(env.REPLY_REQUIRE_MANUAL_APPROVAL, true),
    auntieRulesLoaded: Boolean(auntieRules.source),
    auntieRulesSource: auntieRules.source || "",
    llmProvider: getLlmConfig(env).provider,
    llmConfigured: getLlmConfig(env).configured,
    llmModel: getLlmConfig(env).model,
  };
}

function buildAuthStatus({ rootDir, env = process.env } = {}) {
  return {
    ok: true,
    auth: douyinAuth.redactAuth(douyinAuth.getAuthSnapshot(rootDir, env)),
  };
}

module.exports = {
  buildHealthPayload,
  buildAuthStatus,
  getLlmConfig,
  parseBoolean,
  loadAuntieRules,
};

