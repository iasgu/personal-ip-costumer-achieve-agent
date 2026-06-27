const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const douyinAuth = require("./douyin-auth");

const rootDir = __dirname;
loadDotEnv(path.join(rootDir, ".env"));

const port = Number(process.env.PORT || 8893);
const host = process.env.HOST || "0.0.0.0";
const dataDir = path.join(rootDir, "data");
const commentsPath = path.join(dataDir, "comments.json");
const seedPath = path.join(dataDir, "comments.seed.json");
const repliesPath = path.join(dataDir, "replies.json");
const jobsPath = path.join(dataDir, "jobs.json");
const draftsPath = path.join(dataDir, "publish-drafts.json");
const auntieSubmissionsPath = path.resolve(rootDir, "..", "auntie-douyin-interview", "data", "submissions.json");
const auntieFusedStrategyPath = path.resolve(rootDir, "..", "auntie-douyin-interview", "data", "fused-strategy.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

ensureDir(dataDir);
if (!fs.existsSync(commentsPath)) writeJson(commentsPath, readJson(seedPath, []));
if (!fs.existsSync(repliesPath)) writeJson(repliesPath, []);
if (!fs.existsSync(jobsPath)) writeJson(jobsPath, []);
if (!fs.existsSync(draftsPath)) writeJson(draftsPath, []);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      const auntieRules = loadAuntieRules();
      const auth = douyinAuth.getAuthSnapshot(rootDir);
      const llm = getLlmConfig();
      return sendJson(res, 200, {
        ok: true,
        module: "douyin-comment-reply-agent",
        adapter: process.env.COMMENT_ADAPTER || "mock",
        appType: process.env.DOUYIN_APP_TYPE || "mini",
        configured: isDouyinConfigured(),
        env: getRuntimeEnvStatus(),
        douyinAuth: douyinAuth.redactAuth(auth),
        requireManualApproval: parseBoolean(process.env.REPLY_REQUIRE_MANUAL_APPROVAL, true),
        auntieRulesLoaded: Boolean(auntieRules.source),
        auntieRulesSource: auntieRules.source || "",
        llmProvider: llm.provider,
        llmConfigured: llm.configured,
        llmModel: llm.model,
      });
    }

    if (req.method === "GET" && url.pathname === "/api/comments") {
      const itemId = url.searchParams.get("itemId") || process.env.DOUYIN_ITEM_ID || "item_demo";
      const result = await listComments({ itemId, cursor: url.searchParams.get("cursor") || "0" });
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && url.pathname === "/api/strategy/current") {
      return sendJson(res, 200, { ok: true, strategy: buildCurrentStrategy() });
    }

    if (req.method === "GET" && url.pathname === "/api/douyin/auth/status") {
      return sendJson(res, 200, { ok: true, auth: douyinAuth.redactAuth(douyinAuth.getAuthSnapshot(rootDir)) });
    }

    if (req.method === "POST" && url.pathname === "/api/douyin/auth/exchange") {
      const body = await readBodyJson(req);
      const result = await douyinAuth.exchangeAuthTicket(rootDir, {
        ticket: body.ticket || body.code,
        appId: body.appId || process.env.DOUYIN_APP_ID || process.env.DOUYIN_CLIENT_KEY,
        appSecret: body.appSecret || process.env.DOUYIN_APP_SECRET || process.env.DOUYIN_CLIENT_SECRET,
        baseUrl: process.env.DOUYIN_OPENAPI_BASE,
      });
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/douyin/auth/manual-token") {
      const body = await readBodyJson(req);
      const auth = douyinAuth.saveAuth(rootDir, {
        accessToken: String(body.accessToken || "").trim(),
        refreshToken: String(body.refreshToken || "").trim(),
        openId: String(body.openId || "").trim(),
        scope: String(body.scope || "").trim(),
      });
      return sendJson(res, 200, { ok: true, auth: douyinAuth.redactAuth(auth) });
    }

    if (req.method === "POST" && url.pathname === "/api/douyin/auth/clear") {
      const auth = douyinAuth.clearAuth(rootDir);
      return sendJson(res, 200, { ok: true, auth: douyinAuth.redactAuth(auth) });
    }

    if (req.method === "POST" && url.pathname === "/api/douyin/video/convert") {
      const body = await readBodyJson(req);
      const result = await douyinAuth.convertVideoIds({
        appId: body.appId || process.env.DOUYIN_APP_ID || process.env.DOUYIN_CLIENT_KEY,
        appSecret: body.appSecret || process.env.DOUYIN_APP_SECRET || process.env.DOUYIN_CLIENT_SECRET,
        baseUrl: process.env.DOUYIN_OPENAPI_BASE,
        videoIds: body.videoIds || body.videoId,
      });
      return sendJson(res, 200, { ok: true, result });
    }

    if (req.method === "POST" && url.pathname === "/api/douyin/video/query") {
      const body = await readBodyJson(req);
      const result = await douyinAuth.queryVideoData({
        rootDir,
        itemIds: body.itemIds || body.itemId,
        baseUrl: process.env.DOUYIN_OPENAPI_BASE,
      });
      return sendJson(res, 200, { ok: true, result });
    }

    if (req.method === "POST" && url.pathname === "/api/publish/advice") {
      const body = await readBodyJson(req);
      return sendJson(res, 200, await buildPublishAdvice(body));
    }

    if (req.method === "POST" && url.pathname === "/api/publish/check") {
      const body = await readBodyJson(req);
      return sendJson(res, 200, checkPublishDraft(body));
    }

    if (req.method === "POST" && url.pathname === "/api/publish/drafts") {
      const body = await readBodyJson(req);
      return sendJson(res, 200, createPublishDraft(body));
    }

    if (req.method === "GET" && url.pathname === "/api/publish/drafts") {
      return sendJson(res, 200, { ok: true, drafts: readJson(draftsPath, []) });
    }

    if (req.method === "POST" && url.pathname === "/api/jobs/create") {
      const body = await readBodyJson(req);
      return sendJson(res, 200, await createVideoJob(body));
    }

    const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
    if (req.method === "GET" && jobMatch) {
      return sendJson(res, 200, getVideoJob(jobMatch[1]));
    }

    const suggestionMatch = url.pathname.match(/^\/api\/comments\/([^/]+)\/suggestions$/);
    if (req.method === "POST" && suggestionMatch) {
      const body = await readBodyJson(req);
      const result = await suggestReplies(suggestionMatch[1], body);
      return sendJson(res, 200, result);
    }

    const analyzeMatch = url.pathname.match(/^\/api\/comments\/([^/]+)\/analyze$/);
    if (req.method === "POST" && analyzeMatch) {
      const body = await readBodyJson(req);
      const comment = findComment(analyzeMatch[1], body.commentText);
      return sendJson(res, 200, {
        ok: true,
        commentId: analyzeMatch[1],
        analysis: analyzeComment(comment || { content: body.commentText || "" }),
      });
    }

    const replyMatch = url.pathname.match(/^\/api\/comments\/([^/]+)\/reply$/);
    if (req.method === "POST" && replyMatch) {
      const body = await readBodyJson(req);
      const result = await replyComment(replyMatch[1], body);
      return sendJson(res, 200, result);
    }

    const statusMatch = url.pathname.match(/^\/api\/comments\/([^/]+)\/status$/);
    if (req.method === "POST" && statusMatch) {
      const body = await readBodyJson(req);
      const result = updateCommentStatus(statusMatch[1], body);
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && url.pathname === "/api/replies") {
      return sendJson(res, 200, { ok: true, replies: readJson(repliesPath, []) });
    }

    if (req.method === "GET" && url.pathname === "/api/report") {
      const itemId = url.searchParams.get("itemId") || process.env.DOUYIN_ITEM_ID || "item_demo";
      const format = url.searchParams.get("format") || "json";
      const report = buildOpsReport(itemId);
      if (format === "md" || format === "markdown") {
        res.writeHead(200, {
          "Content-Type": "text/markdown; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(report.markdown);
        return;
      }
      return sendJson(res, 200, { ok: true, report });
    }

    if (req.method === "POST" && url.pathname === "/api/comments/batch-suggestions") {
      const body = await readBodyJson(req);
      const result = await batchSuggestions(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/reset-mock") {
      writeJson(commentsPath, readJson(seedPath, []));
      writeJson(repliesPath, []);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET") return serveStatic(url.pathname, res);
    return sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { ok: false, error: error.message || String(error) });
  }
});

server.listen(port, host, () => {
  console.log(`Douyin comment reply agent running at http://${host}:${port}/`);
});

async function createVideoJob(input) {
  const advice = await buildPublishAdvice(input);
  const job = {
    jobId: makeId("job"),
    status: "draft_ready",
    douyinUrl: String(input.douyinUrl || "").trim(),
    persona: String(input.persona || "个人IP口播账号").trim(),
    offer: String(input.offer || "").trim(),
    title: advice.title,
    script: advice.script,
    caption: advice.caption,
    hashtags: advice.hashtags,
    videoUrl: "https://example.com/generated-personal-ip-demo.mp4",
    coverUrl: "https://example.com/generated-personal-ip-cover.jpg",
    analysis: advice.analysis,
    checks: advice.checks,
    generation: advice.generation,
    assets: input.assets || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const jobs = readJson(jobsPath, []);
  jobs.unshift(job);
  writeJson(jobsPath, jobs);
  return {
    ok: true,
    jobId: job.jobId,
    status: job.status,
    message: "视频发布草稿已生成",
  };
}

function getVideoJob(jobId) {
  const jobs = readJson(jobsPath, []);
  const job = jobs.find((item) => item.jobId === jobId) || jobs[0];
  if (!job) throwHttp(404, "Job not found");
  return { ok: true, ...job };
}

async function buildPublishAdvice(input) {
  const sourceUrl = String(input.douyinUrl || input.sourceUrl || "").trim();
  const persona = String(input.persona || "偏个人IP口语的短视频账号").trim();
  const offer = String(input.offer || "用爆款链接生成个人IP口播视频").trim();
  const sourceSummary = String(input.sourceSummary || input.referenceText || "").trim();
  const baseAdvice = buildRulePublishAdvice({ sourceUrl, persona, offer, sourceSummary });
  const llmAdvice = await buildLlmPublishAdvice({ sourceUrl, persona, offer, sourceSummary, baseAdvice });
  const advice = normalizePublishAdvice(llmAdvice.advice || baseAdvice, baseAdvice);
  const checks = checkPublishDraft(advice).checks;
  return {
    ok: true,
    ...advice,
    checks,
    analysis: {
      sourceUrl,
      persona,
      offer,
      sourceSummary: sourceSummary || "未提供源视频文字信息，当前按链接与账号定位生成发布草稿。",
      principles: [
        "先承接源视频情绪和钩子，再改成账号自己的表达",
        "不承诺确定收益，不强行留联系方式",
        "评论区先轻互动，再用人工确认筛选高价值线索",
      ],
      strategy: buildCurrentStrategy(),
    },
    generation: llmAdvice.generation,
  };
}

function buildRulePublishAdvice({ sourceUrl, persona, offer, sourceSummary }) {
  const hasSourceText = Boolean(sourceSummary);
  const hook = hasSourceText
    ? "这条视频爆，不是因为话说得多，而是开头就把问题钉住了"
    : "同样一条爆款链接，普通人最缺的不是剪辑，是把它改成自己的表达";
  const script = [
    hook,
    `如果你是${persona}，不要直接照搬原视频。先拆它的钩子、情绪和转化点，再换成你自己的案例和口语。`,
    `我们现在做的流程，就是给一个抖音链接，自动拆结构、改写口播、生成发布草稿，再把评论区的高价值问题挑出来。`,
    `重点不是炫技，而是让你每天稳定产出、稳定测试，先跑通一条，再考虑批量放大。`,
  ].join("\n");
  return {
    title: "给一个爆款链接，改成你的个人IP口播",
    caption: `给一个爆款链接，先拆钩子再改成自己的表达。${offer}`,
    script,
    hashtags: ["个人IP", "短视频运营", "AI获客"],
    hooks: [
      "同样的视频，为什么别人能爆你不能？",
      "别急着剪，先把爆款结构拆明白。",
      "普通人做IP，最怕不是不会拍，是每天没内容。",
    ],
  };
}

async function buildLlmPublishAdvice({ sourceUrl, persona, offer, sourceSummary, baseAdvice }) {
  const config = getLlmConfig();
  if (!config.configured) {
    return {
      advice: baseAdvice,
      generation: { provider: config.provider, model: config.model, fallback: true, fallbackReason: "llm_not_configured" },
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content: [
              "你是抖音个人IP发布助手，负责把爆款视频参考改成适合账号发布的口播草稿。",
              "风格：偏个人IP口语、真实、克制、像真人，不要硬广，不要客服腔。",
              "不要承诺涨粉、收益、稳赚，不要直接诱导加微信或手机号。",
              "输出严格 JSON：{\"title\":\"\",\"caption\":\"\",\"script\":\"\",\"hashtags\":[\"\"],\"hooks\":[\"\"]}",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              `源视频链接：${sourceUrl || "未提供"}`,
              `源视频摘要：${sourceSummary || "未提供，只能按爆款短视频通用结构生成"}`,
              `账号定位：${persona}`,
              `转化产品：${offer}`,
              `规则草稿：${JSON.stringify(baseAdvice)}`,
              "请生成 1 个标题、1 段发布文案、1 段 15-30 秒口播脚本、3-5 个话题、3 个开头钩子。",
            ].join("\n"),
          },
        ],
        temperature: Number(process.env.LLM_TEMPERATURE || 0.55),
        max_tokens: Number(process.env.LLM_MAX_TOKENS || 700),
        response_format: { type: "json_object" },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
    const parsed = parseJsonObject(payload.choices?.[0]?.message?.content);
    return {
      advice: parsed,
      generation: { provider: config.provider, model: config.model, fallback: false, fallbackReason: "" },
    };
  } catch (error) {
    return {
      advice: baseAdvice,
      generation: {
        provider: config.provider,
        model: config.model,
        fallback: true,
        fallbackReason: error.name === "AbortError" ? "llm_timeout" : error.message,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

function normalizePublishAdvice(input, fallback) {
  const hashtags = (Array.isArray(input.hashtags) ? input.hashtags : fallback.hashtags)
    .map((item) => String(item || "").replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
  const hooks = (Array.isArray(input.hooks) ? input.hooks : fallback.hooks)
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 3);
  return {
    title: String(input.title || fallback.title).trim().slice(0, 60),
    caption: String(input.caption || fallback.caption).trim().slice(0, 500),
    script: String(input.script || fallback.script).trim().slice(0, 1200),
    hashtags,
    hooks,
  };
}

function checkPublishDraft(input) {
  const title = String(input.title || "");
  const caption = String(input.caption || input.description || "");
  const script = String(input.script || "");
  const hashtags = Array.isArray(input.hashtags) ? input.hashtags : [];
  const combined = `${title}\n${caption}\n${script}\n${hashtags.join(" ")}`;
  const checks = [];
  if (!title.trim()) checks.push({ level: "error", message: "缺少标题" });
  if (title.length > 50) checks.push({ level: "warn", message: "标题偏长，建议控制在 50 字以内" });
  if (!caption.trim()) checks.push({ level: "warn", message: "缺少发布文案" });
  if (hashtags.length > 5) checks.push({ level: "warn", message: "话题过多，建议 3-5 个" });
  const risk = evaluateRisk(combined);
  for (const note of risk.notes) checks.push({ level: "error", message: note });
  if (!checks.length) checks.push({ level: "pass", message: "发布草稿基础检查通过" });
  return { ok: true, risk, checks };
}

function createPublishDraft(input) {
  const check = checkPublishDraft(input);
  const draft = {
    draftId: makeId("draft"),
    status: check.risk.level === "high" ? "need_review" : "ready",
    title: String(input.title || "").trim(),
    caption: String(input.caption || input.description || "").trim(),
    script: String(input.script || "").trim(),
    videoUrl: String(input.videoUrl || "").trim(),
    coverUrl: String(input.coverUrl || "").trim(),
    hashtags: Array.isArray(input.hashtags) ? input.hashtags : [],
    checks: check.checks,
    createdAt: new Date().toISOString(),
  };
  const drafts = readJson(draftsPath, []);
  drafts.unshift(draft);
  writeJson(draftsPath, drafts);
  return { ok: true, draft };
}

function buildCurrentStrategy() {
  const auntieRules = loadAuntieRules();
  return {
    persona: "偏个人IP口语，先像真人再像工具",
    replyStyle: "短句、接话、克制，不硬广，不承诺结果",
    publishStyle: "先拆爆款钩子，再换成自己的案例和转化点",
    humanApproval: true,
    source: auntieRules.source || "built-in",
    hints: auntieRules.hints || [],
  };
}

async function listComments({ itemId, cursor }) {
  if ((process.env.COMMENT_ADAPTER || "mock") === "douyin-openapi") {
    return listDouyinComments({ itemId, cursor });
  }
  const comments = readJson(commentsPath, []);
  const enriched = comments
    .filter((comment) => !itemId || itemId === "all" || comment.itemId === itemId)
    .map(enrichComment);
  return {
    ok: true,
    itemId,
    cursor: Number(cursor || 0),
    hasMore: false,
    summary: summarizeComments(enriched),
    comments: enriched,
  };
}

async function listDouyinComments({ itemId, cursor }) {
  ensureDouyinConfigured();
  const auth = douyinAuth.getAuthSnapshot(rootDir);
  const token = auth.accessToken;
  const base = String(process.env.DOUYIN_OPENAPI_BASE || "https://open.douyin.com").replace(/\/+$/, "");
  const appType = String(process.env.DOUYIN_APP_TYPE || "mini").toLowerCase();
  const endpoint = appType === "mini" ? "/api/apps/v1/item_comment/list/" : "/item/comment/list/";
  const params = new URLSearchParams({
    access_token: token,
    item_id: itemId,
    cursor: String(cursor || 0),
    count: "20",
  });
  const response = await fetch(`${base}${endpoint}?${params}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error_code || payload.err_no) {
    throwHttp(response.status || 502, `抖音评论列表接口失败：${JSON.stringify(payload).slice(0, 500)}`);
  }
  return normalizeDouyinCommentList(payload, itemId);
}

function normalizeDouyinCommentList(payload, itemId) {
  const data = payload.data || payload;
  const list = data.comments || data.list || [];
  return {
    ok: true,
    itemId,
    cursor: Number(data.cursor || 0),
    hasMore: Boolean(data.has_more || data.hasMore),
    raw: payload,
    comments: list.map((item) => enrichComment({
      commentId: String(item.comment_id || item.commentId || item.id || ""),
      itemId,
      userName: item.user?.nickname || item.nickname || "抖音用户",
      userId: String(item.user?.open_id || item.open_id || item.user_id || ""),
      content: item.content || item.text || "",
      createTime: Number(item.create_time || item.createTime || 0),
      diggCount: Number(item.digg_count || item.diggCount || 0),
      replyCommentTotal: Number(item.reply_comment_total || item.replyCommentTotal || 0),
      replyStatus: "pending",
    })),
  };
}

async function suggestReplies(commentId, input) {
  const comment = findComment(commentId, input.commentText);
  const text = String(input.commentText || comment?.content || "");
  const persona = String(input.persona || "个人IP短视频获客顾问");
  const style = String(input.style || process.env.REPLY_STYLE || "personal-ip");
  const analysis = analyzeComment(comment || { content: text });
  const ruleSuggestions = buildSuggestions(text, persona, style, analysis);
  const llmResult = await buildLlmSuggestions({ text, persona, style, analysis, ruleSuggestions });
  const suggestions = llmResult.suggestions;
  return {
    ok: true,
    commentId,
    analysis,
    suggestions,
    generation: {
      provider: llmResult.provider,
      model: llmResult.model,
      fallback: llmResult.fallback,
      fallbackReason: llmResult.fallbackReason,
    },
    risk: evaluateRisk(suggestions.join("\n")),
  };
}

async function replyComment(commentId, input) {
  const text = String(input.text || "").trim();
  if (!text) throwHttp(400, "回复内容不能为空");
  const risk = evaluateRisk(text);
  if (risk.level === "high") throwHttp(400, `回复风险较高：${risk.notes.join("；")}`);

  const itemId = input.itemId || process.env.DOUYIN_ITEM_ID || "item_demo";
  let platformResult = null;
  if ((process.env.COMMENT_ADAPTER || "mock") === "douyin-openapi") {
    platformResult = await replyDouyinComment({ itemId, commentId, text });
  }

  const reply = {
    replyId: makeId("reply"),
    itemId,
    commentId,
    text,
    status: platformResult ? "submitted" : "sent",
    reviewStatus: platformResult ? "pending" : "mock_pass",
    platformResult,
    createdAt: new Date().toISOString(),
  };
  const replies = readJson(repliesPath, []);
  replies.unshift(reply);
  writeJson(repliesPath, replies);

  const comments = readJson(commentsPath, []);
  const comment = comments.find((item) => item.commentId === commentId);
  if (comment) {
    comment.replyStatus = "replied";
    comment.replyText = text;
    comment.repliedAt = reply.createdAt;
    writeJson(commentsPath, comments);
  }

  return { ok: true, reply, risk };
}

async function replyDouyinComment({ itemId, commentId, text }) {
  ensureDouyinConfigured();
  const auth = douyinAuth.getAuthSnapshot(rootDir);
  const token = auth.accessToken;
  const base = String(process.env.DOUYIN_OPENAPI_BASE || "https://open.douyin.com").replace(/\/+$/, "");
  const appType = String(process.env.DOUYIN_APP_TYPE || "mini").toLowerCase();
  const endpoint = appType === "mini" ? "/api/apps/v1/item_comment/reply/" : "/item/comment/reply/";
  const response = await fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: token,
      item_id: itemId,
      comment_id: commentId,
      content: text,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error_code || payload.err_no) {
    throwHttp(response.status || 502, `抖音评论回复接口失败：${JSON.stringify(payload).slice(0, 500)}`);
  }
  return payload;
}

async function buildLlmSuggestions({ text, persona, style, analysis, ruleSuggestions }) {
  const config = getLlmConfig();
  if (!config.configured) {
    return {
      suggestions: ruleSuggestions,
      provider: config.provider,
      model: config.model,
      fallback: true,
      fallbackReason: "llm_not_configured",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: buildReplySystemPrompt() },
          { role: "user", content: buildReplyUserPrompt({ text, persona, style, analysis, ruleSuggestions }) },
        ],
        temperature: Number(process.env.LLM_TEMPERATURE || 0.55),
        max_tokens: Number(process.env.LLM_MAX_TOKENS || 700),
        response_format: { type: "json_object" },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
    const content = payload.choices?.[0]?.message?.content;
    const parsed = parseJsonObject(content);
    const suggestions = normalizeLlmSuggestions(parsed?.suggestions || parsed?.replies || []);
    if (!suggestions.length) throw new Error("empty llm suggestions");
    const risk = evaluateRisk(suggestions.join("\n"));
    if (risk.level === "high") throw new Error(`llm risk blocked: ${risk.notes.join(";")}`);
    return {
      suggestions,
      provider: config.provider,
      model: config.model,
      fallback: false,
      fallbackReason: "",
    };
  } catch (error) {
    return {
      suggestions: ruleSuggestions,
      provider: config.provider,
      model: config.model,
      fallback: true,
      fallbackReason: error.name === "AbortError" ? "llm_timeout" : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildReplySystemPrompt() {
  return [
    "你是抖音评论区运营助手，负责给短视频作者生成评论回复。",
    "回复要求：中文、短句、口语、像真人，不要客服腔，不要长篇说教。",
    "必须遵守：不承诺涨粉、收益、稳赢、百分百有效；不直接留微信、手机号等联系方式；不对骂，不激化矛盾。",
    "如果是财经/价格/投资类评论，只能做情绪承接和风险边界提醒，不能给买卖建议或预测确定方向。",
    "输出严格 JSON，格式：{\"suggestions\":[\"回复1\",\"回复2\"]}。",
  ].join("\n");
}

function buildReplyUserPrompt({ text, persona, style, analysis, ruleSuggestions }) {
  const auntieRules = loadAuntieRules();
  return [
    `账号人设：${persona}`,
    `回复风格：${style}`,
    `评论原文：${text}`,
    `评论分类：${analysis.categoryLabel} / ${analysis.priority} / ${analysis.recommendedAction}`,
    `判断原因：${(analysis.reasons || []).join("；") || "无"}`,
    `当前策略：${(auntieRules.hints || []).join("；")}`,
    `规则候选：${ruleSuggestions.join(" || ")}`,
    "请生成 2 条可直接发到评论区的回复，每条 12-45 个中文字，保留口语感。",
  ].join("\n");
}

function getLlmConfig() {
  const provider = String(process.env.LLM_PROVIDER || process.env.MODEL_PROVIDER || "deepseek").toLowerCase();
  const apiKey = String(process.env.DEEPSEEK_API_KEY || process.env.MODEL_API_KEY || "").trim();
  const baseUrl = String(process.env.DEEPSEEK_BASE_URL || process.env.MODEL_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const model = String(process.env.DEEPSEEK_MODEL || process.env.MODEL_NAME || "deepseek-v4-flash").trim();
  return {
    provider,
    apiKey,
    baseUrl,
    model,
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 20000),
    configured: Boolean(apiKey && model && baseUrl && provider !== "none"),
  };
}

function getRuntimeEnvStatus() {
  const has = (value) => Boolean(String(value || "").trim());
  const mask = (value) => {
    const text = String(value || "").trim();
    if (!text) return "";
    if (text.length <= 8) return `${text.slice(0, 2)}***`;
    return `${text.slice(0, 4)}***${text.slice(-4)}`;
  };

  const appId = String(process.env.DOUYIN_APP_ID || process.env.DOUYIN_CLIENT_KEY || "").trim();
  const appSecret = String(process.env.DOUYIN_APP_SECRET || process.env.DOUYIN_CLIENT_SECRET || "").trim();
  const openApiBase = String(process.env.DOUYIN_OPENAPI_BASE || "https://open.douyin.com").replace(/\/+$/, "");
  const llm = getLlmConfig();

  return {
    douyin: {
      appIdSet: has(appId),
      appIdMasked: mask(appId),
      appSecretSet: has(appSecret),
      openApiBase,
      accessTokenSet: has(process.env.DOUYIN_ACCESS_TOKEN),
      refreshTokenSet: has(process.env.DOUYIN_REFRESH_TOKEN),
      openIdSet: has(process.env.DOUYIN_OPEN_ID),
    },
    llm: {
      provider: llm.provider,
      configured: llm.configured,
      model: llm.model,
      apiKeySet: has(process.env.DEEPSEEK_API_KEY || process.env.MODEL_API_KEY),
      baseUrl: llm.baseUrl,
    },
  };
}

function parseJsonObject(content) {
  const text = String(content || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return text ? JSON.parse(text) : null;
}

function normalizeLlmSuggestions(values) {
  return (Array.isArray(values) ? values : [])
    .map((item) => String(item || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function buildSuggestions(text, persona, style, analysis = null) {
  const prefix = style === "customer-service" ? "您好，" : "";
  if (analysis?.category === "negative_attack") {
    return [
      `${prefix}这个担心可以理解，所以我更建议先拿一条真实视频小范围测，不合适就别用。`,
      `${prefix}不用急着下判断，直接看生成结果最实在。能不能发、像不像人，一条样片就能看出来。`,
    ];
  }
  if (analysis?.category === "guarantee_trap") {
    return [
      `${prefix}这个不能保证，短视频没有百分百的结果。我们能做的是把选题、脚本和成片效率提起来，再用数据筛。`,
      `${prefix}涨粉不建议承诺，我更看重能不能稳定产出、持续测试。先测一条，看质量和反馈更靠谱。`,
    ];
  }
  if (analysis?.category === "account_diagnosis") {
    return [
      `${prefix}可以，先发我一个你正在做的方向或代表视频，我看下问题大概在选题、开头还是表达。`,
      `${prefix}你这种情况先别急着批量发，先挑一条爆款参考，改一版适合你账号的口播测反馈。`,
    ];
  }
  if (analysis?.category === "business_cooperation") {
    return [
      `${prefix}可以聊，但我建议先拿 1-2 个账号做小样测试。效果和流程顺了，再考虑批量跑。`,
      `${prefix}几十个账号更适合先做标准化模板和评论 SOP，先小范围验证成本和质量。`,
    ];
  }
  if (/收费|价格|多少钱|费用|贵/.test(text)) {
    return [
      `${prefix}建议先别急着买，先拿你自己的视频测一版。效果能过，再聊套餐会更靠谱。`,
      `${prefix}费用要看你是只做生成，还是连发布和评论互动一起跑。你可以先发一个方向，我按场景给你估。`,
    ];
  }
  if (/声音|音色|头像|形象|真人/.test(text)) {
    return [
      `${prefix}可以用你自己的头像和声音。头像尽量清晰正脸，声音录一小段，先从 15 秒短视频测效果。`,
      `${prefix}支持个人形象方向，不过我更建议先测一版，看嘴型和质感能不能过你的标准。`,
    ];
  }
  if (/AI|假|不像|效果|真实/.test(text)) {
    return [
      `${prefix}这个确实要看素材质量。我们不是追求完全骗过真人，而是先把选题、脚本和成片效率提起来。`,
      `${prefix}如果头像、声音和脚本都自然，效果会好很多。我们内部也是按“能不能发出去”这个标准来测。`,
    ];
  }
  if (/文案|不会写|脚本|选题/.test(text)) {
    return [
      `${prefix}可以不用从零写。给一个爆款链接，系统会先拆钩子和转化点，再改成适合你账号的口播。`,
      `${prefix}它更像一个短视频助理：先帮你拆爆款，再给你一版能改、能录、能发的脚本。`,
    ];
  }
  return [
    `${prefix}这个问题挺关键，我们现在就是按真实账号日更场景在打磨。可以先拿一条视频试跑，看结果适不适合你的定位。`,
    `${prefix}我建议先小范围测，不要一上来铺太大。先看一条从分析到成片的质量，再决定要不要批量跑。`,
  ];
}

function enrichComment(comment) {
  const analysis = analyzeComment(comment);
  return {
    ...comment,
    analysis,
    category: analysis.category,
    categoryLabel: analysis.categoryLabel,
    leadScore: analysis.leadScore,
    priority: analysis.priority,
    recommendedAction: analysis.recommendedAction,
  };
}

function analyzeComment(comment) {
  const text = String(comment?.content || comment?.text || "");
  const likeScore = Math.min(12, Math.floor(Number(comment?.diggCount || 0) / 3));
  let category = "normal";
  let categoryLabel = "普通互动";
  let leadScore = 20 + likeScore;
  let priority = "low";
  let recommendedAction = "可回复";
  const reasons = [];
  const auntieRules = loadAuntieRules();

  const labels = collectCommentLabels(text);
  if (/保证|一定|百分百|100%|涨粉一万|稳赚|必爆|躺赚/.test(text)) {
    category = "guarantee_trap";
    categoryLabel = "承诺陷阱";
    leadScore = 25 + likeScore;
    priority = "medium";
    recommendedAction = "澄清边界";
    reasons.push("询问或诱导绝对承诺");
  } else if (/割韭菜|骗子|骗人|别吹|垃圾|忽悠|傻|滚|坑/.test(text)) {
    category = "negative_attack";
    categoryLabel = "负面质疑";
    leadScore = 10 + likeScore;
    priority = "low";
    recommendedAction = "低情绪回应或忽略";
    reasons.push("包含攻击或强质疑");
  } else if (/合作|公司|几十个|批量|团队|代理|商务/.test(text)) {
    category = "business_cooperation";
    categoryLabel = "合作线索";
    leadScore = 88 + likeScore;
    priority = "high";
    recommendedAction = "优先人工跟进";
    reasons.push("包含合作/批量/团队意向");
  } else if (/账号|帮我看看|诊断|没流量|起号|发了.*没/.test(text)) {
    category = "account_diagnosis";
    categoryLabel = "账号诊断";
    leadScore = 82 + likeScore;
    priority = "high";
    recommendedAction = "引导提供账号或代表视频";
    reasons.push("明确请求诊断账号");
  } else if (/案例|效果|试试|想试|第一步|怎么开始/.test(text)) {
    category = "trial_intent";
    categoryLabel = "试用意向";
    leadScore = 76 + likeScore;
    priority = "high";
    recommendedAction = "引导先测一条";
    reasons.push("有试用/看案例意向");
  } else if (/收费|价格|多少钱|费用|贵/.test(text)) {
    category = "price_question";
    categoryLabel = "价格咨询";
    leadScore = 68 + likeScore;
    priority = "medium";
    recommendedAction = "先问需求再报价";
    reasons.push("询问价格或费用");
  } else if (/声音|音色|头像|形象|真人|自己的/.test(text)) {
    category = "asset_question";
    categoryLabel = "素材咨询";
    leadScore = 62 + likeScore;
    priority = "medium";
    recommendedAction = "解释头像/声音流程";
    reasons.push("询问个人素材能力");
  } else if (/文案|脚本|选题|不会写|发什么/.test(text)) {
    category = "content_question";
    categoryLabel = "内容咨询";
    leadScore = 58 + likeScore;
    priority = "medium";
    recommendedAction = "解释爆款拆解和改写";
    reasons.push("询问内容生产能力");
  } else if (/AI|假|不像|真实|效果/.test(text)) {
    category = "quality_question";
    categoryLabel = "效果质疑";
    leadScore = 52 + likeScore;
    priority = "medium";
    recommendedAction = "承认边界并引导看样片";
    reasons.push("关注 AI 质感和真实度");
  } else if (/餐饮|老板|门店|小店|本地生活|美容|教培|实体店|面馆|店/.test(text)) {
    category = "industry_fit";
    categoryLabel = "行业适配";
    leadScore = 64 + likeScore;
    priority = "medium";
    recommendedAction = "结合行业场景回复";
    reasons.push("询问具体行业是否适用");
  }

  leadScore = Math.max(0, Math.min(100, leadScore));
  if (leadScore >= 75) priority = "high";
  else if (leadScore >= 45 && priority !== "high") priority = "medium";

  return {
    category,
    categoryLabel,
    labels,
    leadScore,
    priority,
    recommendedAction,
    reasons,
    auntieRuleHints: auntieRules.hints,
  };
}

function collectCommentLabels(text) {
  const labels = [];
  const checks = [
    ["price", "价格", /收费|价格|多少钱|费用|贵/],
    ["asset", "头像/声音", /声音|音色|头像|形象|真人|自己的/],
    ["quality", "效果", /AI|假|不像|真实|效果/],
    ["content", "文案/选题", /文案|脚本|选题|不会写|发什么/],
    ["account", "账号诊断", /账号|帮我看看|诊断|没流量|起号|发了.*没/],
    ["cooperation", "合作", /合作|公司|几十个|批量|团队|代理|商务/],
    ["trial", "试用/案例", /案例|效果|试试|想试|第一步|怎么开始/],
    ["negative", "负面", /割韭菜|骗子|骗人|别吹|垃圾|忽悠|傻|滚|坑/],
    ["promise_trap", "承诺陷阱", /保证|一定|百分百|100%|涨粉一万|稳赚|必爆|躺赚/],
    ["industry", "行业适配", /餐饮|老板|门店|小店|本地生活|美容|教培|实体店|面馆|店/],
  ];
  for (const [key, label, pattern] of checks) {
    if (pattern.test(text)) labels.push({ key, label });
  }
  return labels;
}

async function batchSuggestions(input) {
  const itemId = input.itemId || process.env.DOUYIN_ITEM_ID || "item_demo";
  const limit = Math.max(1, Math.min(Number(input.limit || 5), 20));
  const priority = String(input.priority || "high");
  const persona = input.persona || "个人IP短视频获客顾问";
  const style = input.style || process.env.REPLY_STYLE || "personal-ip";
  const comments = readJson(commentsPath, [])
    .filter((comment) => !itemId || itemId === "all" || comment.itemId === itemId)
    .map(enrichComment)
    .filter((comment) => comment.replyStatus === "pending")
    .filter((comment) => priority === "all" || comment.priority === priority)
    .sort((a, b) => b.leadScore - a.leadScore)
    .slice(0, limit);
  return {
    ok: true,
    itemId,
    count: comments.length,
    items: await Promise.all(comments.map(async (comment) => {
      const ruleSuggestions = buildSuggestions(comment.content, persona, style, comment.analysis);
      const llmResult = await buildLlmSuggestions({ text: comment.content, persona, style, analysis: comment.analysis, ruleSuggestions });
      return {
        comment,
        suggestions: llmResult.suggestions,
        generation: {
          provider: llmResult.provider,
          model: llmResult.model,
          fallback: llmResult.fallback,
          fallbackReason: llmResult.fallbackReason,
        },
        risk: evaluateRisk(llmResult.suggestions.join("\n")),
      };
    })),
  };
}

function buildOpsReport(itemId) {
  const comments = readJson(commentsPath, [])
    .filter((comment) => !itemId || itemId === "all" || comment.itemId === itemId)
    .map(enrichComment)
    .sort((a, b) => b.leadScore - a.leadScore);
  const replies = readJson(repliesPath, []).filter((reply) => !itemId || itemId === "all" || reply.itemId === itemId);
  const summary = summarizeComments(comments);
  const highValue = comments.filter((comment) => comment.priority === "high");
  const negative = comments.filter((comment) => comment.category === "negative_attack" || comment.category === "guarantee_trap");
  const pending = comments.filter((comment) => comment.replyStatus === "pending");
  const auntieRules = loadAuntieRules();

  const markdown = [
    "# 抖音评论互动运营报告",
    "",
    `生成时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
    `视频 item_id：${itemId}`,
    "",
    "## 总览",
    "",
    `- 评论总数：${summary.total}`,
    `- 高优先级：${summary.highPriority}`,
    `- 中优先级：${summary.mediumPriority}`,
    `- 低优先级：${summary.lowPriority}`,
    `- 已回复：${comments.filter((item) => item.replyStatus === "replied").length}`,
    `- 已忽略：${comments.filter((item) => item.replyStatus === "ignored").length}`,
    `- 待处理：${pending.length}`,
    "",
    "## 分类统计",
    "",
    ...Object.entries(summary.categories).map(([name, count]) => `- ${name}：${count}`),
    "",
    "## 高价值线索",
    "",
    ...formatCommentList(highValue),
    "",
    "## 负面/风险评论",
    "",
    ...formatCommentList(negative),
    "",
    "## 回复 SOP",
    "",
    "- 高优先级评论先处理：合作、账号诊断、试用/案例。",
    "- 价格类评论不要直接硬报价，先问场景或引导试一条。",
    "- 质疑类评论先承认担心合理，再给低门槛测试方式，不对怼。",
    "- 承诺陷阱必须澄清边界，不能说保证涨粉、稳赚、百分百有效。",
    "- 攻击性评论可以忽略或低情绪回应，不进入争辩。",
    "",
    "## 舅妈规则提示",
    "",
    ...(auntieRules.hints.length ? auntieRules.hints.map((item) => `- ${item}`) : ["- 暂无真实访谈规则，当前使用内置规则。"]),
    "",
    "## 已提交回复",
    "",
    ...(replies.length ? replies.map((reply) => `- ${reply.commentId}：${reply.text}（${reply.reviewStatus}）`) : ["- 暂无"]),
    "",
  ].join("\n");

  return {
    itemId,
    generatedAt: new Date().toISOString(),
    summary,
    highValue,
    negative,
    pendingCount: pending.length,
    replies,
    auntieRules,
    markdown,
  };
}

function formatCommentList(comments) {
  if (!comments.length) return ["- 暂无"];
  return comments.flatMap((comment) => [
    `- 【${comment.categoryLabel} / ${comment.leadScore}分】${comment.userName}：${comment.content}`,
    `  - 建议动作：${comment.recommendedAction}`,
  ]);
}

function updateCommentStatus(commentId, input) {
  const status = String(input.status || "").trim();
  if (!["pending", "ignored", "handled"].includes(status)) {
    throwHttp(400, "状态只支持 pending、ignored、handled");
  }
  const comments = readJson(commentsPath, []);
  const comment = comments.find((item) => item.commentId === commentId);
  if (!comment) throwHttp(404, "Comment not found");
  comment.replyStatus = status;
  comment.statusReason = String(input.reason || "").trim();
  comment.updatedAt = new Date().toISOString();
  writeJson(commentsPath, comments);
  return { ok: true, comment: enrichComment(comment) };
}

function summarizeComments(comments) {
  const summary = {
    total: comments.length,
    highPriority: 0,
    mediumPriority: 0,
    lowPriority: 0,
    categories: {},
  };
  for (const comment of comments) {
    if (comment.priority === "high") summary.highPriority += 1;
    else if (comment.priority === "medium") summary.mediumPriority += 1;
    else summary.lowPriority += 1;
    summary.categories[comment.categoryLabel] = (summary.categories[comment.categoryLabel] || 0) + 1;
  }
  return summary;
}

function loadAuntieRules() {
  const fused = readJson(auntieFusedStrategyPath, null);
  if (fused?.generatedAt) {
    const sectionHints = fused.sections
      ? [
          ...(fused.sections.rules || []).slice(0, 2).map((item) => item.text),
          ...(fused.sections.leadSignals || []).slice(0, 2).map((item) => item.text),
          ...(fused.sections.negativeHandling || []).slice(0, 2).map((item) => item.text),
          ...(fused.sections.replyStyle || []).slice(0, 1).map((item) => item.text),
          ...(fused.sections.avoid || []).slice(0, 1).map((item) => item.text),
        ]
      : [];
    return {
      source: `fused-strategy:${fused.generatedAt}`,
      sampleCount: fused.submissionCount || 0,
      realCount: fused.realCount || 0,
      syntheticCount: fused.syntheticCount || 0,
      modelGeneratedCount: fused.modelGeneratedCount || 0,
      hints: (Array.isArray(fused.hints) && fused.hints.length ? fused.hints : sectionHints).slice(0, 8),
    };
  }
  const submissions = readJson(auntieSubmissionsPath, []);
  const latest = Array.isArray(submissions)
    ? submissions.find((item) => item.insight?.leadSignals || item.insight?.negativeHandling)
    : null;
  if (!latest) {
    return { source: "", hints: [] };
  }
  const insight = latest.insight || {};
  const hints = [
    ...(insight.rules || []),
    ...(insight.leadSignals || []),
    ...(insight.negativeHandling || []),
    ...(insight.replyStyle || []),
    ...(insight.avoid || []),
  ].slice(0, 8);
  return {
    source: latest.id,
    hints,
  };
}

function evaluateRisk(text) {
  const notes = [];
  const normalized = String(text || "");
  const promisePattern = /稳赚|必爆|躺赚|100%有效|百分百有效|一定涨粉|保证涨粉|保证有效|保证能|保证你/;
  const boundaryPattern = /不保证|不能保证|不承诺|没有百分百|不是百分百|短视频没有百分百|无法保证|别承诺/;
  if (promisePattern.test(normalized) && !boundaryPattern.test(normalized)) notes.push("包含绝对化或收益承诺");
  if (/微信|手机号|加我|私下转账|银行卡/.test(text)) notes.push("包含敏感私域或交易表达");
  return { level: notes.length ? "high" : "low", notes };
}

function findComment(commentId, fallbackText) {
  const comments = readJson(commentsPath, []);
  return comments.find((item) => item.commentId === commentId) || (fallbackText ? { commentId, content: fallbackText } : null);
}

function isDouyinConfigured() {
  return Boolean(douyinAuth.getAuthSnapshot(rootDir).accessToken);
}

function ensureDouyinConfigured() {
  if (!isDouyinConfigured()) throwHttp(501, "抖音评论 OpenAPI 未配置：缺少 DOUYIN_ACCESS_TOKEN。");
}

function serveStatic(urlPath, res) {
  const normalized = decodeURIComponent(urlPath === "/" ? "/index.html" : urlPath);
  const filePath = path.normalize(path.join(rootDir, normalized));
  if (!filePath.startsWith(rootDir)) return sendJson(res, 403, { ok: false, error: "Forbidden" });
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return sendJson(res, 404, { ok: false, error: "Not found" });
  res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function readBodyJson(req, limitBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (Buffer.byteLength(raw) > limitBytes) {
        reject(Object.assign(new Error("请求体过大"), { statusCode: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error("Invalid JSON body"), { statusCode: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function throwHttp(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}
