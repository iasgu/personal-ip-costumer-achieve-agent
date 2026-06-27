const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const rootDir = __dirname;
loadDotEnv(path.join(rootDir, ".env"));

const port = Number(process.env.PORT || 8891);
const host = process.env.HOST || "127.0.0.1";
const dataDir = path.join(rootDir, "data");
const draftsPath = path.join(dataDir, "drafts.json");
const publishesPath = path.join(dataDir, "publishes.json");
const commentsPath = path.join(dataDir, "comments.json");
const commentsSeedPath = path.join(dataDir, "comments.seed.json");
const jimengEvaluationsPath = path.join(dataDir, "jimeng-evaluations.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

ensureDir(dataDir);
ensureJsonArray(draftsPath);
ensureJsonArray(publishesPath);
ensureJsonArray(jimengEvaluationsPath);
if (!fs.existsSync(commentsPath)) {
  const seed = fs.existsSync(commentsSeedPath) ? readJsonFile(commentsSeedPath, []) : [];
  writeJsonFile(commentsPath, seed);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        module: "publish-interaction-agent",
        version: "2026-06-24",
        publishAdapter: process.env.PUBLISH_ADAPTER || "mock",
        replyStyle: process.env.REPLY_STYLE || "personal-ip",
        douyinConfigured: Boolean(
          process.env.DOUYIN_CLIENT_KEY &&
            process.env.DOUYIN_CLIENT_SECRET &&
            process.env.DOUYIN_REDIRECT_URI &&
            process.env.DOUYIN_ACCESS_TOKEN
        ),
      });
    }

    if (req.method === "POST" && url.pathname === "/api/publish/drafts") {
      const body = await readJson(req);
      const draft = createDraft(body);
      const drafts = readJsonFile(draftsPath, []);
      drafts.unshift(draft);
      writeJsonFile(draftsPath, drafts);
      return sendJson(res, 200, { ok: true, draftId: draft.draftId, status: draft.status, draft });
    }

    if (req.method === "GET" && url.pathname === "/api/publish/drafts") {
      return sendJson(res, 200, { ok: true, drafts: readJsonFile(draftsPath, []) });
    }

    const submitMatch = url.pathname.match(/^\/api\/publish\/drafts\/([^/]+)\/submit$/);
    if (req.method === "POST" && submitMatch) {
      const result = submitDraft(submitMatch[1]);
      return sendJson(res, 200, result);
    }

    const statusMatch = url.pathname.match(/^\/api\/publish\/([^/]+)\/status$/);
    if (req.method === "GET" && statusMatch) {
      const result = getPublishStatus(statusMatch[1]);
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && url.pathname === "/api/comments") {
      const publishId = url.searchParams.get("publishId") || "pub_demo";
      const comments = readJsonFile(commentsPath, []).filter((comment) => !comment.publishId || comment.publishId === publishId || publishId === "all");
      return sendJson(res, 200, { ok: true, publishId, comments });
    }

    const suggestionMatch = url.pathname.match(/^\/api\/comments\/([^/]+)\/suggestions$/);
    if (req.method === "POST" && suggestionMatch) {
      const body = await readJson(req);
      const result = suggestReplies(suggestionMatch[1], body);
      return sendJson(res, 200, result);
    }

    const replyMatch = url.pathname.match(/^\/api\/comments\/([^/]+)\/reply$/);
    if (req.method === "POST" && replyMatch) {
      const body = await readJson(req);
      const result = replyComment(replyMatch[1], body.text || "");
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/jimeng/evaluate") {
      const body = await readJson(req);
      const record = createJimengEvaluation(body);
      const records = readJsonFile(jimengEvaluationsPath, []);
      records.unshift(record);
      writeJsonFile(jimengEvaluationsPath, records);
      return sendJson(res, 200, { ok: true, recordId: record.recordId, record });
    }

    if (req.method === "GET" && url.pathname === "/api/jimeng/evaluations") {
      return sendJson(res, 200, { ok: true, records: readJsonFile(jimengEvaluationsPath, []) });
    }

    if (req.method === "GET") {
      return serveStatic(url.pathname, res);
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { ok: false, error: error.message || String(error) });
  }
});

server.listen(port, host, () => {
  console.log(`Publish Interaction Agent running at http://${host}:${port}/`);
});

function createDraft(input) {
  const now = new Date().toISOString();
  return {
    draftId: makeId("draft"),
    platform: input.platform || "douyin",
    videoUrl: cleanText(input.videoUrl),
    title: cleanText(input.title),
    description: cleanText(input.description),
    hashtags: normalizeTags(input.hashtags),
    coverUrl: cleanText(input.coverUrl),
    scheduledAt: input.scheduledAt || null,
    source: input.source || {},
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

function submitDraft(draftId) {
  const drafts = readJsonFile(draftsPath, []);
  const draft = drafts.find((item) => item.draftId === draftId);
  if (!draft) throwHttp(404, "Draft not found");

  const publish = {
    publishId: makeId("pub"),
    draftId,
    platform: draft.platform,
    status: "submitted",
    reviewStatus: "pending",
    shareUrl: "",
    submittedAt: new Date().toISOString(),
  };
  const publishes = readJsonFile(publishesPath, []);
  publishes.unshift(publish);
  writeJsonFile(publishesPath, publishes);

  draft.status = "submitted";
  draft.updatedAt = new Date().toISOString();
  writeJsonFile(draftsPath, drafts);

  return { ok: true, ...publish };
}

function getPublishStatus(publishId) {
  const publishes = readJsonFile(publishesPath, []);
  const publish = publishes.find((item) => item.publishId === publishId);
  if (!publish) throwHttp(404, "Publish record not found");

  const elapsedMs = Date.now() - new Date(publish.submittedAt).getTime();
  if (elapsedMs >= 10_000 && publish.status !== "published") {
    publish.status = "published";
    publish.reviewStatus = "pass";
    publish.shareUrl = `https://www.douyin.com/video/mock-${publish.publishId}`;
    publish.publishedAt = new Date().toISOString();
    writeJsonFile(publishesPath, publishes);
  }

  return { ok: true, ...publish };
}

function suggestReplies(commentId, input) {
  const comments = readJsonFile(commentsPath, []);
  const comment = comments.find((item) => item.commentId === commentId);
  if (!comment) throwHttp(404, "Comment not found");

  const text = `${input.commentText || comment.text || ""}`;
  const style = process.env.REPLY_STYLE || "personal-ip";
  const suggestions = buildReplySuggestions(text, style);
  return {
    ok: true,
    commentId,
    style,
    suggestions,
    risk: evaluateReplyRisk(suggestions.join("\n")),
  };
}

function replyComment(commentId, text) {
  const replyText = cleanText(text);
  if (!replyText) throwHttp(400, "Reply text is required");
  const risk = evaluateReplyRisk(replyText);
  if (risk.level === "high") {
    throwHttp(400, `回复风险较高：${risk.notes.join("；")}`);
  }

  const comments = readJsonFile(commentsPath, []);
  const comment = comments.find((item) => item.commentId === commentId);
  if (!comment) throwHttp(404, "Comment not found");

  comment.replyStatus = "replied";
  comment.replyText = replyText;
  comment.repliedAt = new Date().toISOString();
  writeJsonFile(commentsPath, comments);

  return { ok: true, replyId: makeId("reply"), status: "sent", risk, comment };
}

function createJimengEvaluation(input) {
  return {
    recordId: makeId("jimeng_eval"),
    mode: input.mode || "digital-human-fast",
    input: input.input || {},
    result: {
      durationSeconds: Number(input.durationSeconds || input.result?.durationSeconds || 0),
      costEstimate: Number(input.costEstimate || input.result?.costEstimate || 0),
      latencySeconds: Number(input.latencySeconds || input.result?.latencySeconds || 0),
      qualityScore: Number(input.qualityScore || input.result?.qualityScore || 0),
      fitForPersonalIp: input.fitForPersonalIp || input.result?.fitForPersonalIp || "unknown",
      notes: cleanText(input.notes || input.result?.notes || ""),
    },
    createdAt: new Date().toISOString(),
  };
}

function buildReplySuggestions(text, style) {
  const prefix = style === "personal-ip" ? "" : "您好，";
  if (/收费|价格|多少钱|费用|贵/.test(text)) {
    return [
      `${prefix}现在更建议先拿一条你自己的视频测效果，别一上来就买。跑出来你觉得能用，再聊套餐会更靠谱。`,
      `${prefix}价格要看你是只做生成，还是连发布和评论互动一起跑。你可以先发我一个方向，我按你的场景给你估。`,
    ];
  }
  if (/声音|音色|头像|形象|真人/.test(text)) {
    return [
      `${prefix}可以用你自己的头像和声音。头像上传一张清晰正脸照，声音可以录一小段，系统会按这个基准去生成口播视频。`,
      `${prefix}支持个人形象和音色，不过我更建议先用 15 秒短视频测一版，看嘴型和质感能不能过你的标准。`,
    ];
  }
  if (/AI|不像|假|效果|真实/.test(text)) {
    return [
      `${prefix}这个确实要看素材质量。我们现在的思路不是追求完全骗过真人，而是先把选题、口播和分发效率提起来，再人工挑能发的版本。`,
      `${prefix}如果头像、音频和脚本都比较自然，成片会好很多。我们内部也是按“能不能发出去”这个标准来测。`,
    ];
  }
  if (/文案|不会写|脚本|选题/.test(text)) {
    return [
      `${prefix}可以不用自己从零写。你给一个爆款链接，系统会先拆钩子、情绪和转化点，再改成适合你账号的口播。`,
      `${prefix}它更像一个短视频助理：先帮你拆爆款，再给你一版能改、能录、能发的脚本。`,
    ];
  }
  return [
    `${prefix}这个问题挺关键的，我们现在就是按真实账号日更场景来打磨。你可以先拿一条视频试跑，看结果适不适合你的定位。`,
    `${prefix}我建议先小范围测，不要一次性铺太大。先看一条视频从分析到成片的质量，再决定要不要批量跑。`,
  ];
}

function evaluateReplyRisk(text) {
  const notes = [];
  if (/保证|稳赚|必爆|一定涨粉|100%|百分百/.test(text)) notes.push("包含绝对化承诺");
  if (/私下转账|银行卡|返现/.test(text)) notes.push("包含交易风险表达");
  return { level: notes.length ? "high" : "low", notes };
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean).slice(0, 8);
  return String(value || "")
    .split(/[,\s#，、]+/)
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 8);
}

function serveStatic(urlPath, res) {
  const normalized = decodeURIComponent(urlPath === "/" ? "/index.html" : urlPath);
  const filePath = path.normalize(path.join(rootDir, normalized));
  if (!filePath.startsWith(rootDir)) return sendJson(res, 403, { ok: false, error: "Forbidden" });
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return sendJson(res, 404, { ok: false, error: "Not found" });
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function readJson(req, limitBytes = 1024 * 1024) {
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
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function ensureJsonArray(filePath) {
  if (!fs.existsSync(filePath)) writeJsonFile(filePath, []);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
}

function cleanText(value) {
  return String(value || "").trim().slice(0, 2000);
}

function throwHttp(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

