const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const rootDir = __dirname;
const port = Number(process.env.PORT || 8894);
const host = process.env.HOST || "127.0.0.1";
const dataDir = path.join(rootDir, "data");
const submissionsPath = path.join(dataDir, "submissions.json");
const fusedStrategyPath = path.join(dataDir, "fused-strategy.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

ensureDir(dataDir);
if (!fs.existsSync(submissionsPath)) writeJson(submissionsPath, []);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, module: "auntie-douyin-interview" });
    }

    if (req.method === "GET" && url.pathname === "/api/questions") {
      return sendJson(res, 200, { ok: true, questions: buildQuestions() });
    }

    if (req.method === "POST" && url.pathname === "/api/submit") {
      const body = await readBodyJson(req);
      const submission = normalizeSubmission(body);
      const submissions = readJson(submissionsPath, []);
      submissions.unshift(submission);
      writeJson(submissionsPath, submissions);
      return sendJson(res, 200, { ok: true, submissionId: submission.id, insight: buildInsight(submission) });
    }

    if (req.method === "GET" && url.pathname === "/api/submissions") {
      const submissions = readJson(submissionsPath, []);
      return sendJson(res, 200, { ok: true, submissions });
    }

    if (req.method === "GET" && url.pathname === "/api/strategy") {
      return sendJson(res, 200, { ok: true, strategy: loadFusedStrategy() });
    }

    if (req.method === "POST" && url.pathname === "/api/strategy/fuse") {
      const strategy = buildFusedStrategy(readJson(submissionsPath, []));
      writeJson(fusedStrategyPath, strategy);
      return sendJson(res, 200, { ok: true, strategy });
    }

    if (req.method === "GET") return serveStatic(url.pathname, res);
    return sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { ok: false, error: error.message || String(error) });
  }
});

server.listen(port, host, () => {
  console.log(`Auntie Douyin interview running at http://${host}:${port}/`);
});

function buildQuestions() {
  return [
    {
      id: "profile",
      title: "先了解你平时怎么评论",
      type: "form",
      items: [
        { key: "ageRange", label: "你大概属于哪个年龄段？", placeholder: "比如 40-50" },
        { key: "commentHabit", label: "你平时会评论抖音吗？什么情况下会评论？", placeholder: "比如 觉得有用、想问价格、想吐槽" },
        { key: "replyPreference", label: "别人怎么回你，你会觉得舒服？", placeholder: "比如 真实点、别太官方、别一直让我私信" },
      ],
    },
    {
      id: "comment_judgement",
      title: "你怎么看一条评论值不值得回复？",
      type: "open",
      prompts: [
        "什么评论你会认真回复？",
        "什么评论你会随便回一句？",
        "什么评论你觉得别回复比较好？",
        "什么评论一看就是想买/想合作/有价值？",
        "什么评论容易吵起来？",
      ],
    },
    {
      id: "comment_cases",
      title: "看到这些评论，你会怎么回？",
      type: "comment_cases",
      cases: [
        "这个东西多少钱？",
        "是不是骗人的？",
        "能不能用我自己的头像和声音？",
        "普通人不会写文案能用吗？",
        "效果会不会很像 AI？",
        "你这个视频一看就是假的。",
        "我也想做，但是我不知道发什么。",
        "这个适合餐饮店老板吗？",
        "能不能帮我看看我的账号？",
        "有没有案例？",
        "怎么联系你？",
        "这个会不会违规？",
        "我没有时间拍视频怎么办？",
        "你说得太夸张了吧。",
        "我想试试，第一步要干嘛？"
      ],
    },
    {
      id: "negative_cases",
      title: "遇到质疑和负面评论怎么办？",
      type: "open",
      prompts: [
        "别人说“骗人的”，你觉得怎么回不容易吵起来？",
        "别人说“AI太假”，你怎么回比较自然？",
        "别人骂人或阴阳怪气，你会删、忽略，还是回？为什么？",
        "哪些话千万不能回？",
      ],
    },
    {
      id: "lead_boundary",
      title: "怎么引导别人继续聊，才不烦？",
      type: "open",
      prompts: [
        "别人问价格，直接报价好，还是先让他试？",
        "什么时候可以引导私信？怎么说不招人烦？",
        "评论区能不能留联系方式？你觉得怎么说更安全？",
        "如果想让别人留下链接/账号，你会怎么说？",
      ],
    },
  ];
}

function normalizeSubmission(input) {
  const answers = input.answers || {};
  return {
    id: `interview_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`,
    interviewee: String(input.interviewee || "舅妈").trim(),
    synthetic: Boolean(input.synthetic),
    modelGenerated: Boolean(input.modelGenerated),
    model: String(input.model || "").trim(),
    traits: String(input.traits || "").trim(),
    answers,
    insight: buildInsight({ answers }),
    createdAt: new Date().toISOString(),
  };
}

function buildInsight(submission) {
  const answers = submission.answers || {};
  const allText = JSON.stringify(answers, null, 2);
  const rules = [];
  const avoid = [];
  const replyStyle = [];
  const leadSignals = [];
  const negativeHandling = [];

  if (/认真|有价值|想买|合作|联系|试试|案例|账号/.test(allText)) rules.push("优先回复有明确需求、想试、问案例、问账号诊断、问联系方式的评论。");
  if (/真实|自然|别官方|像真人|口语/.test(allText)) replyStyle.push("回复要像真人说话，短句、口语、别像客服模板。");
  if (/价格|多少钱|收费|贵/.test(allText)) replyStyle.push("价格类评论先问需求或引导试一条，不要上来硬报价。");
  if (/头像|声音|音色|真人/.test(allText)) replyStyle.push("素材类问题要说清楚：可以用自己的头像和声音，但建议先测 15 秒效果。");
  if (/骗人|假的|质疑|夸张|AI太假|不像/.test(allText)) negativeHandling.push("质疑类评论先承认担心合理，再给测试方式，不要对怼。");
  if (/骂|阴阳怪气|吵|删除|忽略/.test(allText)) negativeHandling.push("攻击性评论不建议认真争辩，可忽略、隐藏或只做低情绪回应。");
  if (/私信|联系|链接|账号|留下/.test(allText)) leadSignals.push("问联系、问案例、愿意留链接/账号的评论，是高价值线索。");
  if (/微信|手机号|联系方式|二维码/.test(allText)) avoid.push("评论区避免直接发联系方式，可用“主页/私信/先留链接我看下”这类更安全表达。");
  if (/保证|一定|百分百|稳赚|必爆/.test(allText)) avoid.push("回复里不要承诺必爆、保证涨粉、稳赚等绝对结果。");

  return {
    rules: rules.length ? rules : ["先区分评论价值：需求明确的优先回，情绪攻击的少回或不回。"],
    leadSignals: leadSignals.length ? leadSignals : ["问价格、问案例、问能不能帮看账号、愿意试一条，都是高价值线索。"],
    negativeHandling: negativeHandling.length ? negativeHandling : ["质疑类评论先共情，再给低门槛测试方式，避免争辩。"],
    avoid: avoid.length ? avoid : ["避免联系方式外露、绝对承诺、客服腔和机械复制。"],
    replyStyle: replyStyle.length ? replyStyle : ["回复要短、像真人，不夸大承诺，尽量引导先测一版。"],
    rawTextLength: allText.length,
  };
}

function loadFusedStrategy() {
  const existing = readJson(fusedStrategyPath, null);
  if (existing?.generatedAt) return existing;
  return buildFusedStrategy(readJson(submissionsPath, []));
}

function buildFusedStrategy(submissions) {
  const valid = Array.isArray(submissions) ? submissions.filter((item) => item?.insight) : [];
  const sections = {
    rules: collectWeightedItems(valid, "rules"),
    leadSignals: collectWeightedItems(valid, "leadSignals"),
    negativeHandling: collectWeightedItems(valid, "negativeHandling"),
    replyStyle: collectWeightedItems(valid, "replyStyle"),
    avoid: collectWeightedItems(valid, "avoid"),
  };
  const hints = [
    ...sections.rules.slice(0, 2),
    ...sections.leadSignals.slice(0, 2),
    ...sections.negativeHandling.slice(0, 2),
    ...sections.replyStyle.slice(0, 1),
    ...sections.avoid.slice(0, 1),
  ].map((item) => item.text);

  return {
    generatedAt: new Date().toISOString(),
    submissionCount: valid.length,
    realCount: valid.filter(isHumanSubmission).length,
    syntheticCount: valid.filter((item) => item.synthetic).length,
    legacySyntheticCount: valid.filter((item) => !item.synthetic && !isHumanSubmission(item)).length,
    modelGeneratedCount: valid.filter((item) => item.modelGenerated).length,
    sources: valid.slice(0, 30).map((item) => ({
      id: item.id,
      interviewee: item.interviewee,
      synthetic: Boolean(item.synthetic),
      human: isHumanSubmission(item),
      modelGenerated: Boolean(item.modelGenerated),
      model: item.model || "",
      createdAt: item.createdAt,
    })),
    sections,
    hints,
    summary: {
      priority: "优先回复有明确需求、试用、案例、账号诊断、合作意向的评论。",
      risk: "对质疑类先共情再给测试路径；绝不承诺涨粉、收益、百分百效果，也不在评论区暴露联系方式。",
      style: "偏个人IP口语，短句、像真人，不要客服腔，尽量引导先测一条。",
    },
  };
}

function collectWeightedItems(submissions, sectionKey) {
  const map = new Map();
  const now = Date.now();
  for (const item of submissions) {
    const values = Array.isArray(item.insight?.[sectionKey]) ? item.insight[sectionKey] : [];
    for (const raw of values) {
      const text = normalizeText(raw);
      if (!text) continue;
      const current = map.get(text) || {
        text,
        count: 0,
        realCount: 0,
        syntheticCount: 0,
        modelGeneratedCount: 0,
        humanRecentCount: 0,
        score: 0,
        sources: [],
      };
      const isHuman = isHumanSubmission(item);
      const createdAtMs = Date.parse(item.createdAt || "");
      const isRecentHuman = isHuman && Number.isFinite(createdAtMs) && now - createdAtMs <= 24 * 60 * 60 * 1000;
      const weight = isHuman ? (isRecentHuman ? 7 : 5) : item.modelGenerated ? 1.5 : 1;
      current.count += 1;
      current.score += weight;
      if (isHuman) current.realCount += 1;
      else current.syntheticCount += 1;
      if (isRecentHuman) current.humanRecentCount += 1;
      if (item.modelGenerated) current.modelGeneratedCount += 1;
      if (current.sources.length < 8) current.sources.push(item.id);
      map.set(text, current);
    }
  }
  return [...map.values()].sort((a, b) => {
    const scoreA = a.score;
    const scoreB = b.score;
    return scoreB - scoreA || b.count - a.count || a.text.length - b.text.length;
  });
}

function isHumanSubmission(item) {
  if (!item || item.synthetic || item.modelGenerated || item.model) return false;
  const name = String(item.interviewee || "");
  const syntheticNamePattern = /示例|用户|运营|老板|店长|负责人|合作方|博主|达人|助理|销售|咨询师|律师|私域|房产|教培|健身|医美|宝妈|敏感|探店|直播|制造业|小红书|价格/;
  if (syntheticNamePattern.test(name)) return false;
  return true;
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[。；;,.，]+$/g, "")
    .trim();
}

function serveStatic(urlPath, res) {
  const normalized = decodeURIComponent(urlPath === "/" ? "/index.html" : urlPath);
  const filePath = path.normalize(path.join(rootDir, normalized));
  if (!filePath.startsWith(rootDir)) return sendJson(res, 403, { ok: false, error: "Forbidden" });
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return sendJson(res, 404, { ok: false, error: "Not found" });
  res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function readBodyJson(req, limitBytes = 2 * 1024 * 1024) {
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
