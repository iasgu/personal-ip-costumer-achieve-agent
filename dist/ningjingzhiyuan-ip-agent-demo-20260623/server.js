const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");

const rootDir = __dirname;
const port = Number(process.env.PORT || 8765);
const host = process.env.HOST || "127.0.0.1";
const uploadDir = path.join(rootDir, "assets", "uploads");
const outputDir = path.join(rootDir, "assets", "outputs");
const assetManifestPath = path.join(uploadDir, "manifest.json");
const discoveryHistoryPath = path.join(outputDir, "douyin-discovery-history.json");
const videoTaskGroups = new Map();
const standardAssets = {
  avatar: {
    kind: "video",
    name: "standard-avatar-wikimedia.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/e/e3/Portrait-sample.jpg",
    contentType: "image/jpeg",
    source: "Wikimedia Commons Portrait-sample.jpg",
  },
  voice: {
    kind: "voice",
    name: "standard-voice-wikimedia.mp3",
    url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/a/ac/Mahahahiniahuhuhuhuh.ogg/Mahahahiniahuhuhuhuh.ogg.mp3",
    contentType: "audio/mpeg",
    source: "Wikimedia Commons Mahahahiniahuhuhuhuh.ogg MP3 transcode",
  },
};

loadDotEnv(path.join(rootDir, ".env"));

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  const requestStartedAt = Date.now();
  const requestPath = (() => {
    try {
      return new URL(req.url, `http://${req.headers.host}`).pathname;
    } catch {
      return req.url || "";
    }
  })();
  res.on("finish", () => {
    if (requestPath.startsWith("/api/")) {
      console.log(`[api] ${req.method} ${requestPath} ${res.statusCode} ${Date.now() - requestStartedAt}ms`);
    }
  });
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        modelConfigured: Boolean(getModelBaseUrl() && getModelApiKey()),
        textModel: process.env.MODEL_NAME || null,
        multimodalModel: process.env.MODEL_MULTIMODAL_NAME || "multimodal",
        videoModel: process.env.MODEL_VIDEO_NAME || process.env.MODEL_MULTIMODAL_NAME || "multimodal",
        asrModel: process.env.ASR_MODEL_NAME || "whisper-1",
        asrConfigured: Boolean((process.env.ASR_BASE_URL || getModelBaseUrl()) && (process.env.ASR_API_KEY || getModelApiKey())),
        browserProfileDir: getBrowserProfileDir(),
      });
    }

    if (req.method === "POST" && url.pathname === "/api/browser/open-login") {
      const body = await readJson(req, getJsonLimitBytes(url.pathname));
      const result = await openLoginBrowser(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/assets/upload") {
      const result = await handleAssetUpload(req);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/assets/standard/install") {
      const result = await installStandardAssets();
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/video/resolve") {
      const body = await readJson(req, getJsonLimitBytes(url.pathname));
      const result = await resolveDouyinInput(body.url || body.shareText || body.command || "");
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/video/discover") {
      const body = await readJson(req, getJsonLimitBytes(url.pathname));
      const result = await discoverDouyinVideo(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/video/capture") {
      const body = await readJson(req, getJsonLimitBytes(url.pathname));
      const result = await captureVideoPage(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/video/capture-extract") {
      const body = await readJson(req, getJsonLimitBytes(url.pathname));
      const capture = await captureVideoPage(body);
      if (!isCaptureUsable(capture)) {
        const blockedReason = getCaptureBlockedReason(capture);
        return sendJson(res, 422, {
          error: blockedReason || "录屏抽帧未拿到可分析的视频画面。请先点击“打开登录浏览器”，登录抖音并手动播放该视频后再采集。",
          capture: {
            source: capture.source,
            url: capture.url,
            resolvedUrl: capture.resolvedUrl,
            inputType: capture.inputType,
            finalUrl: capture.finalUrl,
            title: capture.title,
            frameCount: capture.frameDataUrls?.length || 0,
            hasScreenshot: Boolean(capture.screenshotDataUrl),
            hasVideoUrl: Boolean(capture.videoUrl),
            hasVideoTarget: Boolean(capture.videoTarget),
            audio: capture.audio || null,
            transcriptLength: String(capture.transcript || "").length,
            capturedAt: capture.capturedAt,
          },
        });
      }
      const result = await extractVideoStructure({
        ...body,
        sourceText: [body.sourceText, body.transcript, capture.transcript].filter(Boolean).join("\n\n"),
        imageUrl: body.imageUrl,
        frameDataUrls: capture.frameDataUrls,
        videoUrl: capture.videoUrl || body.videoUrl,
        capture,
      });
      return sendJson(res, 200, {
        ...result,
        capture,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/video/extract") {
      const body = await readJson(req, getJsonLimitBytes(url.pathname));
      const result = await extractVideoStructure(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/script/rewrite") {
      const body = await readJson(req, getJsonLimitBytes(url.pathname));
      const result = await rewriteScript(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/audio/synthesize") {
      const body = await readJson(req, getJsonLimitBytes(url.pathname));
      const result = await synthesizeVoice(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/video/avatar-render") {
      const body = await readJson(req, getJsonLimitBytes(url.pathname));
      const result = await renderAvatarVideo(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/video/finalize") {
      const body = await readJson(req, getJsonLimitBytes(url.pathname));
      const result = await finalizeVideo(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/video/tasks/")) {
      const taskId = decodeURIComponent(url.pathname.split("/").pop() || "");
      const result = await getDashScopeTask(taskId);
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/video/task-groups/")) {
      const groupId = decodeURIComponent(url.pathname.split("/").pop() || "");
      const result = await getVideoTaskGroup(groupId);
      return sendJson(res, 200, result);
    }

    if (req.method === "GET") {
      return serveStatic(req, res);
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    sendJson(res, error.statusCode || 500, {
      error: error.message || "Internal server error",
    });
  }
});

server.listen(port, host, () => {
  console.log(`IP Agent demo running at http://${host}:${port}/`);
});

async function openLoginBrowser(input = {}) {
  const resolvedInput = await resolveDouyinInput(input.url || input.shareText || input.command || "https://www.douyin.com/");
  const targetUrl = resolvedInput.resolvedUrl || resolvedInput.url || "https://www.douyin.com/";
  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    throwHttp(500, "未找到 Chrome 或 Edge，请先安装浏览器。");
  }

  fs.mkdirSync(getBrowserProfileDir(), { recursive: true });
  const cdpPort = Number(process.env.BROWSER_CDP_PORT || 9223);
  const args = [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${getBrowserProfileDir()}`,
    "--profile-directory=Default",
    "--no-first-run",
    "--new-window",
    targetUrl,
  ];

  const child = spawn(browserPath, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();

  return {
    ok: true,
    message: "已打开登录态浏览器窗口。请在该窗口完成抖音登录，然后回到本页面点击采集分析。",
    browserPath,
    profileDir: getBrowserProfileDir(),
    cdpPort,
    url: targetUrl,
    inputType: resolvedInput.inputType,
  };
}

async function discoverDouyinVideo(input = {}) {
  const keyword = String(input.keyword || process.env.DOUYIN_TEST_KEYWORD || "餐饮老板").trim();
  const limit = Math.max(3, Math.min(30, Number(input.limit || 16)));
  const maxDurationSeconds = Math.max(5, Math.min(600, Number(input.maxDurationSeconds || process.env.DOUYIN_TEST_MAX_SECONDS || 60)));
  const history = readDiscoveryHistory();
  const excluded = new Set([
    ...history.items.map((item) => normalizeDouyinVideoUrl(item.url || item.resolvedUrl || "")),
    ...(Array.isArray(input.excludeUrls) ? input.excludeUrls.map(normalizeDouyinVideoUrl) : []),
  ].filter(Boolean));
  const searchUrl = `https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=video`;

  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    throwHttp(500, "未找到 Chrome 或 Edge，无法自动搜索抖音测试视频。");
  }

  fs.mkdirSync(getBrowserProfileDir(), { recursive: true });
  const cdpPort = Number(process.env.BROWSER_CDP_PORT || 9223);
  let proc = null;
  try {
    let pageWsUrl = await findCdpPage(cdpPort, searchUrl).catch(() => null);
    if (!pageWsUrl) {
      proc = spawn(browserPath, [
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${getBrowserProfileDir()}`,
        "--profile-directory=Default",
        "--no-first-run",
        "--disable-popup-blocking",
        "--window-size=1280,900",
        searchUrl,
      ], {
        stdio: "ignore",
        windowsHide: true,
      });
      pageWsUrl = await waitForCdpPage(cdpPort, searchUrl);
    }

    const page = createCdpClient(pageWsUrl);
    await page.call("Page.enable");
    await page.call("Runtime.enable");
    await page.call("Page.bringToFront").catch(() => {});
    const currentUrl = await getCurrentPageUrl(page);
    if (!currentUrl.includes("douyin.com/search") || !decodeURIComponent(currentUrl).includes(keyword)) {
      await page.call("Page.navigate", { url: searchUrl });
      await waitForPageSettled(page);
    }
    await scrollDouyinSearchResults(page);
    const candidates = await collectDouyinVideoLinks(page, limit);
    await page.close();

    const enrichedCandidates = candidates.map((item) => ({
      ...item,
      durationSeconds: parseDouyinCandidateDurationSeconds(item.title),
    }));
    const unusedCandidates = enrichedCandidates
      .map((item) => ({
        ...item,
        url: normalizeDouyinVideoUrl(item.url),
      }))
      .filter((item) => item.url && !excluded.has(item.url));
    const selected = unusedCandidates.find((item) => item.durationSeconds > 0 && item.durationSeconds <= maxDurationSeconds) ||
      (maxDurationSeconds >= 60 ? unusedCandidates[0] : null) ||
      null;

    if (!selected) {
      throwHttp(404, `没有在抖音搜索结果里找到新的可用视频链接：${keyword}`);
    }

    const record = {
      ...selected,
      keyword,
      discoveredAt: new Date().toISOString(),
    };
    appendDiscoveryHistory(record);

    return {
      ok: true,
      keyword,
      searchUrl,
      maxDurationSeconds,
      selected: record,
      candidates: enrichedCandidates,
      historyCount: history.items.length + 1,
    };
  } finally {
    if (proc) proc.kill();
  }
}

async function handleAssetUpload(req) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throwHttp(415, "资产上传必须使用 multipart/form-data。");
  }

  const body = await readRawBody(req, getUploadLimitBytes());
  const { fields, files } = parseMultipartFormData(body, contentType);
  const kind = normalizeAssetKind(fields.kind || fields.assetKind || fields.type);
  const file = files.file || files.asset || Object.values(files)[0];
  if (!kind) {
    throwHttp(400, "缺少资产类型：voice、video 或 history。");
  }
  if (!file || !file.data?.length) {
    throwHttp(400, "没有收到资产文件。");
  }

  validateAssetFile(kind, file);
  fs.mkdirSync(uploadDir, { recursive: true });

  const ext = getSafeAssetExtension(file.filename, file.contentType);
  const id = `${kind}-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`;
  const safeName = sanitizeFilename(file.filename || `${kind}${ext}`);
  const storedName = `${id}${ext}`;
  const absolutePath = path.join(uploadDir, storedName);
  fs.writeFileSync(absolutePath, file.data);

  const asset = {
    id,
    kind,
    name: safeName,
    storedName,
    contentType: file.contentType || "application/octet-stream",
    size: file.data.length,
    sizeLabel: formatBytes(file.data.length),
    url: `/assets/uploads/${storedName}`,
    path: absolutePath,
    uploadedAt: new Date().toISOString(),
  };
  appendAssetManifest(asset);

  return {
    ok: true,
    asset,
  };
}

async function installStandardAssets() {
  const [video, voice] = await Promise.all([
    downloadStandardAsset(standardAssets.avatar),
    downloadStandardAsset(standardAssets.voice),
  ]);
  return {
    ok: true,
    assets: {
      video,
      voice,
    },
    note: "标准素材仅用于验证生成通路；正式交付请使用用户上传或录制的真人形象和声音。",
  };
}

async function downloadStandardAsset(definition) {
  fs.mkdirSync(uploadDir, { recursive: true });
  const existing = findExistingStandardAsset(definition);
  if (existing) return existing;

  const ext = getSafeAssetExtension(definition.name, definition.contentType);
  const id = `${definition.kind}-standard-${crypto.randomUUID().slice(0, 8)}`;
  const safeName = sanitizeFilename(definition.name);
  const storedName = `${id}${ext}`;
  const absolutePath = path.join(uploadDir, storedName);

  if (!fs.existsSync(absolutePath)) {
    const response = await fetch(definition.url);
    if (!response.ok) {
      const fallback = findExistingStandardAsset(definition, { allowMissingSource: true });
      if (fallback) return fallback;
      throwHttp(502, `标准素材下载失败 ${response.status}: ${definition.url}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
      throwHttp(502, `标准素材为空: ${definition.url}`);
    }
    fs.writeFileSync(absolutePath, buffer);
  }

  const size = fs.statSync(absolutePath).size;
  const asset = {
    id,
    kind: definition.kind,
    name: safeName,
    storedName,
    contentType: definition.contentType || "application/octet-stream",
    size,
    sizeLabel: formatBytes(size),
    url: `/assets/uploads/${storedName}`,
    path: absolutePath,
    uploadedAt: new Date().toISOString(),
    source: definition.source,
    standard: true,
  };
  appendAssetManifest(asset);
  return asset;
}

function findExistingStandardAsset(definition, options = {}) {
  const manifest = readAssetManifest();
  const matched = manifest.find((asset) =>
    asset.kind === definition.kind &&
    asset.name === definition.name &&
    (options.allowMissingSource || asset.source === definition.source) &&
    asset.path &&
    fs.existsSync(asset.path)
  );
  if (matched) return matched;

  const ext = getSafeAssetExtension(definition.name, definition.contentType);
  const file = fs.existsSync(uploadDir)
    ? fs.readdirSync(uploadDir).find((name) => name.endsWith(ext) && name.includes(definition.kind))
    : "";
  if (!file) return null;
  const absolutePath = path.join(uploadDir, file);
  if (!fs.existsSync(absolutePath)) return null;
  const size = fs.statSync(absolutePath).size;
  return {
    id: file.replace(ext, ""),
    kind: definition.kind,
    name: definition.name,
    storedName: file,
    contentType: definition.contentType || "application/octet-stream",
    size,
    sizeLabel: formatBytes(size),
    url: `/assets/uploads/${file}`,
    path: absolutePath,
    uploadedAt: new Date(fs.statSync(absolutePath).mtimeMs).toISOString(),
    source: definition.source,
    standard: true,
  };
}

function readAssetManifest() {
  if (!fs.existsSync(assetManifestPath)) return [];
  try {
    const manifest = JSON.parse(fs.readFileSync(assetManifestPath, "utf8"));
    return Array.isArray(manifest) ? manifest : [];
  } catch {
    return [];
  }
}

async function uploadLocalFileToDashScope(filePath, modelName) {
  const apiKey = getDashScopeApiKey();
  const resolvedPath = resolveAssetLocalPath(filePath);
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    throwHttp(400, "DashScope 临时上传失败：本地资产文件不存在。");
  }
  const model = String(modelName || process.env.DASHSCOPE_UPLOAD_MODEL || "wan2.7-i2v").trim();
  const uploadBaseUrl = String(process.env.DASHSCOPE_API_BASE_URL || "https://dashscope.aliyuncs.com").replace(/\/+$/, "");
  const policyUrl = `${uploadBaseUrl}/api/v1/uploads?action=getPolicy&model=${encodeURIComponent(model)}`;

  const policyResponse = await fetch(policyUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  const policyPayload = await policyResponse.json().catch(() => ({}));
  if (!policyResponse.ok) {
    throwHttp(502, `DashScope 获取上传凭证失败 ${policyResponse.status}: ${JSON.stringify(policyPayload).slice(0, 500)}`);
  }
  const policy = policyPayload.data || {};
  const filename = sanitizeFilename(path.basename(resolvedPath));
  const objectKey = `${policy.upload_dir}/${filename}`;
  const form = new FormData();
  form.set("OSSAccessKeyId", policy.oss_access_key_id);
  form.set("Signature", policy.signature);
  form.set("policy", policy.policy);
  form.set("x-oss-object-acl", policy.x_oss_object_acl);
  form.set("x-oss-forbid-overwrite", policy.x_oss_forbid_overwrite);
  form.set("key", objectKey);
  form.set("success_action_status", "200");
  form.set("file", new Blob([fs.readFileSync(resolvedPath)], { type: mimeTypes[path.extname(resolvedPath).toLowerCase()] || "application/octet-stream" }), filename);

  const uploadResponse = await fetch(policy.upload_host, {
    method: "POST",
    body: form,
  });
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => "");
    throwHttp(502, `DashScope 临时文件上传失败 ${uploadResponse.status}: ${detail.slice(0, 500)}`);
  }

  return {
    model,
    ossUrl: `oss://${objectKey}`,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  };
}

function getDashScopeApiKey() {
  const apiKey = String(process.env.DASHSCOPE_API_KEY || process.env.ALIYUN_API_KEY || "").trim();
  if (!apiKey) {
    throwHttp(501, "缺少 DASHSCOPE_API_KEY。wan2.7-i2v/wan 系列视频生成和临时文件上传必须使用中国内地（北京）百炼 API Key。");
  }
  return apiKey;
}

function resolveAssetLocalPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const resolved = path.resolve(raw);
  if (!resolved.startsWith(uploadDir)) {
    throwHttp(403, "资产路径不在允许的上传目录内。");
  }
  return resolved;
}

function isImageAsset(asset = {}) {
  const ext = path.extname(asset.path || asset.name || asset.url || "").toLowerCase();
  const type = String(asset.contentType || asset.type || "").toLowerCase();
  return type.startsWith("image/") || [".jpg", ".jpeg", ".png", ".bmp", ".webp"].includes(ext);
}

function isWanAudioAsset(asset = {}) {
  const ext = path.extname(asset.path || asset.name || asset.url || "").toLowerCase();
  const type = String(asset.contentType || asset.type || "").toLowerCase();
  return ["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3"].includes(type) || [".wav", ".mp3"].includes(ext);
}

async function resolveDouyinInput(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    throwHttp(400, "请粘贴抖音复制口令、v.douyin.com 短链或 douyin.com 视频页链接。");
  }

  const url = extractFirstUrl(raw);
  if (!url) {
    return {
      inputType: "command-without-url",
      raw,
      url: "",
      resolvedUrl: "",
      ok: false,
      message: "当前口令里没有可识别的 URL。建议在抖音里选择“复制口令”，完整粘贴包含 v.douyin.com 的文本。",
    };
  }

  const inputType = raw === url
    ? classifyDouyinUrl(url)
    : "douyin-command";
  const resolvedUrl = await resolveRedirectUrl(url);
  return {
    inputType,
    raw,
    url,
    resolvedUrl,
    ok: Boolean(resolvedUrl),
    message: resolvedUrl === url ? "已识别视频链接。" : "已解析短链跳转。",
  };
}

function extractFirstUrl(text) {
  const match = String(text || "").match(/https?:\/\/[^\s"'<>，。！？）)】]+/i);
  return match ? normalizePastedUrl(match[0]) : "";
}

function normalizePastedUrl(url) {
  return String(url || "")
    .trim()
    .replace(/[，。！？、；：]+$/g, "")
    .replace(/[.,!?;:]+$/g, "");
}

function normalizeDouyinVideoUrl(value) {
  const raw = normalizePastedUrl(value);
  if (!raw) return "";
  const modal = raw.match(/[?&]modal_id=(\d{12,25})/);
  if (modal) return `https://www.douyin.com/video/${modal[1]}`;
  const direct = raw.match(/douyin\.com\/(?:video|note)\/(\d{12,25})/);
  if (direct) return `https://www.douyin.com/video/${direct[1]}`;
  return raw;
}

function classifyDouyinUrl(url) {
  try {
    const host = new URL(url).hostname;
    if (host.includes("v.douyin.com")) return "douyin-shortlink";
    if (host.includes("douyin.com")) return "douyin-page";
  } catch {
    // Fall through.
  }
  return "url";
}

function readDiscoveryHistory() {
  try {
    if (!fs.existsSync(discoveryHistoryPath)) return { items: [] };
    const parsed = JSON.parse(fs.readFileSync(discoveryHistoryPath, "utf8"));
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return { items: [] };
  }
}

function appendDiscoveryHistory(record) {
  fs.mkdirSync(path.dirname(discoveryHistoryPath), { recursive: true });
  const history = readDiscoveryHistory();
  const normalized = normalizeDouyinVideoUrl(record.url || record.resolvedUrl || "");
  const items = [
    {
      ...record,
      url: normalized || record.url,
    },
    ...history.items.filter((item) => normalizeDouyinVideoUrl(item.url || item.resolvedUrl || "") !== normalized),
  ].slice(0, 200);
  fs.writeFileSync(discoveryHistoryPath, `${JSON.stringify({ items }, null, 2)}\n`, "utf8");
}

function parseDouyinCandidateDurationSeconds(text) {
  const value = String(text || "");
  const match = value.match(/(?:^|\n|\s)(\d{1,2}):(\d{2})(?=\n|\s|$)/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

async function resolveRedirectUrl(url) {
  let current = normalizePastedUrl(url);
  for (let index = 0; index < 5; index += 1) {
    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      },
    }).catch(() => null);
    if (!response) return current;
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }
    return response.url || current;
  }
  return current;
}

async function captureVideoPage(input = {}) {
  const rawInput = String(input.url || input.shareText || input.command || "").trim();
  if (!rawInput) {
    throwHttp(400, "Missing required field: url");
  }
  const resolvedInput = await resolveDouyinInput(rawInput);
  const targetUrl = resolvedInput.resolvedUrl || resolvedInput.url;

  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    throwHttp(500, "未找到 Chrome 或 Edge，无法启动登录态采集浏览器。");
  }

  fs.mkdirSync(getBrowserProfileDir(), { recursive: true });
  const cdpPort = Number(process.env.BROWSER_CDP_PORT || 9223);
  const userDataDir = getBrowserProfileDir();
  let proc = null;
  let ownsBrowser = false;

  try {
    let pageWsUrl = await findCdpPage(cdpPort, targetUrl).catch(() => null);
    if (!pageWsUrl) {
      ownsBrowser = true;
      proc = spawn(browserPath, [
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${userDataDir}`,
        "--profile-directory=Default",
        "--no-first-run",
        "--disable-popup-blocking",
        "--window-size=1280,900",
        targetUrl,
      ], {
        stdio: "ignore",
        windowsHide: true,
      });
      pageWsUrl = await waitForCdpPage(cdpPort, targetUrl);
    }

    const page = createCdpClient(pageWsUrl);
    await page.call("Page.enable");
    await page.call("Runtime.enable");
    await page.call("Page.bringToFront").catch(() => {});
    const currentUrl = await getCurrentPageUrl(page);
    if (ownsBrowser || shouldNavigateForCapture(currentUrl, targetUrl)) {
      await page.call("Page.navigate", { url: targetUrl });
      await waitForPageSettled(page);
    }
    await delay(Number(process.env.BROWSER_CAPTURE_WAIT_MS || 2500));

    let snapshot = await evaluatePageSnapshot(page);
    await prepareVideoPlayback(page);
    await delay(Number(process.env.BROWSER_PLAYBACK_WARMUP_MS || 1200));
    const videoTarget = await getVideoCaptureTarget(page);
    snapshot = {
      ...snapshot,
      ...(await evaluatePageSnapshot(page)),
      videoUrl: videoTarget?.src || snapshot.videoUrl,
    };
    const clip = videoTarget?.clip || null;
    const frameDataUrls = await captureVideoFrames(page, {
      count: Number(input.frameCount || process.env.BROWSER_FRAME_COUNT || 5),
      intervalMs: Number(input.frameIntervalMs || process.env.BROWSER_FRAME_INTERVAL_MS || 1600),
      clip,
      durationSeconds: videoTarget?.duration || 0,
    });
    const audioCapture = await captureVideoAudio(page, {
      durationMs: Number(input.audioDurationMs || process.env.BROWSER_AUDIO_CAPTURE_MS || 12000),
    });
    const transcriptResult = await transcribeCapturedAudio(audioCapture).catch((error) => ({
      transcript: "",
      status: "failed",
      error: error.message,
    }));
    const screenshotDataUrl = frameDataUrls[0] || await captureScreenshotDataUrl(page, clip);
    await page.close();

    return {
      source: "screen-frames",
      url: rawInput,
      resolvedUrl: targetUrl,
      inputType: resolvedInput.inputType,
      finalUrl: snapshot.finalUrl,
      title: snapshot.title,
      description: snapshot.description,
      text: "",
      debugText: compactCaptureText(snapshot),
      videoUrl: snapshot.videoUrl,
      videoTarget,
      audio: {
        status: transcriptResult.status || audioCapture.status,
        mimeType: audioCapture.mimeType || "",
        byteLength: audioCapture.byteLength || 0,
        error: transcriptResult.error || audioCapture.error || "",
      },
      transcript: transcriptResult.transcript || "",
      screenshotDataUrl,
      frameDataUrls,
      frameCount: frameDataUrls.length,
      profileDir: userDataDir,
      capturedAt: new Date().toISOString(),
    };
  } finally {
    if (proc) proc.kill();
  }
}

async function extractVideoStructure(input) {
  ensureModelConfigured();

  const normalized = normalizeExtractInput(input);
  if (
    !normalized.url &&
    !normalized.sourceText &&
    !normalized.imageUrl &&
    !normalized.videoUrl &&
    normalized.frameDataUrls.length === 0
  ) {
    throwHttp(400, "请至少提供爆款视频链接、原始口播文本或画面图片 URL。");
  }

  if (
    normalized.url &&
    !normalized.sourceText &&
    !normalized.imageUrl &&
    !normalized.videoUrl &&
    normalized.frameDataUrls.length === 0
  ) {
    return buildUrlOnlyExtractResult(normalized);
  }

  const systemPrompt = [
    "你是短视频爆款结构分析智能体，服务对象是不会拍摄、不会剪辑、但要做个人IP获客的中小商家。",
    "你的任务是做第一步「自动化提取」：从用户提供的视频链接、口播文本、截图/封面里，拆出可复用的内容结构。",
    "只输出严格 JSON，不要 Markdown，不要解释。",
    "不要编造平台真实数据；如果链接无法直接访问，就基于用户提供的文本和业务场景做结构化推断，并在 evidence 里说明。",
    "输出字段必须包含：summary, hook, structure, emotionCurve, conversionPoint, reusablePattern, risks, evidence, confidence。",
    "structure 必须是数组，每一项包含 stage, purpose, originalCue, reusableRule。",
    "risks 必须检查：搬运风险、夸大承诺、违规引流、行业适配偏差。",
  ].join("\n");

  const userText = [
    `爆款视频链接：${normalized.url || "未提供"}`,
    `视频直链：${normalized.videoUrl || "未获取到"}`,
    `ASR字幕/人工口播：${normalized.sourceText || "未提供。请只基于多帧画面分析视觉结构，不要根据网页列表文字推断。"}`,
    `画面帧数量：${normalized.frameDataUrls.length}`,
    `目标行业：${normalized.industry || "未指定"}`,
    `IP人设：${normalized.persona || "未指定"}`,
    `转化产品/服务：${normalized.offer || "未指定"}`,
    `执行模式：${normalized.mode || "auto"}`,
    "",
    "请按下面 JSON 结构输出：",
    JSON.stringify({
      summary: "一句话概括这个爆款内容为什么有效",
      hook: {
        text: "开场钩子",
        type: "痛点/反差/数据/演示/身份压迫等",
        whyItWorks: "钩子有效原因",
      },
      structure: [
        {
          stage: "步骤名",
          purpose: "这一段在用户心理里的作用",
          originalCue: "原片里的线索或表达",
          reusableRule: "可迁移到目标行业的规则",
        },
      ],
      emotionCurve: ["好奇", "焦虑", "相信", "想行动"],
      conversionPoint: {
        action: "用户被引导做什么",
        wordingRisk: "转化话术风险",
        saferRewrite: "更稳妥的替代表达",
      },
      reusablePattern: "可复用爆款骨架",
      risks: {
        copycat: "搬运/同质化风险判断",
        promise: "夸大承诺风险判断",
        lead: "违规引流风险判断",
        fit: "行业适配偏差判断",
      },
      evidence: ["用于判断的文本、画面或链接线索"],
      confidence: 0.82,
    }),
  ].join("\n");

  const useVideoPart = Boolean(normalized.videoUrl && normalized.frameDataUrls.length === 0);
  const contentParts = [
    { type: "text", text: userText },
    ...(useVideoPart
      ? [
          {
            type: "video_url",
            video_url: {
              url: normalized.videoUrl,
            },
          },
        ]
      : []),
    ...getModelFrameDataUrls(normalized.frameDataUrls).map((url, index) => ({
      type: "image_url",
      image_url: {
        url,
        detail: index === 0 ? "high" : "low",
      },
    })),
    ...(normalized.imageUrl
      ? [
          {
            type: "image_url",
            image_url: {
              url: normalized.imageUrl,
              detail: "low",
            },
          },
        ]
      : []),
  ];

  const messages = normalized.imageUrl || useVideoPart || normalized.frameDataUrls.length > 0
    ? [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: contentParts,
        },
      ]
    : [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ];

  const model = useVideoPart
    ? process.env.MODEL_VIDEO_NAME || process.env.MODEL_MULTIMODAL_NAME || "multimodal"
    : normalized.imageUrl || normalized.frameDataUrls.length > 0
      ? process.env.MODEL_MULTIMODAL_NAME || "multimodal"
    : process.env.MODEL_NAME || "deepseek-v4-flash";

  let content = "";
  try {
    content = await callModel(messages, {
      model,
      temperature: Number(process.env.MODEL_EXTRACT_TEMPERATURE || 0.2),
      maxTokens: Number(process.env.MODEL_EXTRACT_MAX_TOKENS || 1200),
    });
  } catch (error) {
    const fallback = buildExtractFallback(normalized, error.message || "");
    fallback.source = "fallback";
    fallback.evidence = [
      ...(fallback.evidence || []),
      `模型提取失败，已降级：${String(error.message || "").slice(0, 220)}`,
      normalized.sourceText ? `ASR/口播：${normalized.sourceText.slice(0, 220)}` : "",
      normalized.frameDataUrls.length ? `已采集 ${normalized.frameDataUrls.length} 帧画面` : "",
    ].filter(Boolean);
    fallback.confidence = Math.max(0.42, Number(fallback.confidence || 0.5) - 0.12);
    return normalizeExtractResult(fallback, normalized);
  }

  const parsed = parseJsonObject(content, () => buildExtractFallback(normalized, content));
  return normalizeExtractResult(parsed, normalized);
}

async function rewriteScript(input) {
  ensureModelConfigured();

  const extraction = sanitizeExtractionForRewrite(input.extraction || null);
  input.extraction = extraction;
  if (
    extraction?.source === "url-only" &&
    !String(input.originalText || input.sourceText || "").trim() &&
    !String(input.imageUrl || "").trim()
  ) {
    throwHttp(422, "素材不足：当前只有视频链接，未获取到口播、字幕或画面，不能进入文案改写。");
  }

  const hasRewriteTarget = Boolean(String(input.industry || input.persona || input.offer || "").trim());
  const schemaPrompt = [
    "你是面向 C 端个人 IP 创作者的短视频改写智能体。",
    hasRewriteTarget
      ? "你的任务：基于爆款结构提取结果，把内容改写为指定行业、指定 IP 风格的可发布短视频内容包。"
      : "你的任务：基于源视频本身的主题、画面、口播和结构，生成同主题但不照搬的可发布短视频内容包；不要强行迁移到餐饮、获客、AI课程等未指定行业。",
    "只输出严格 JSON，不要 Markdown，不要解释。",
    "文案必须适合口播，中文，短句，强开场。",
    "不要承诺确定收益，不要直接写违规引流话术。",
    hasRewriteTarget
      ? "保留爆款结构，但必须完成行业差异化，不能照搬原文。"
      : "保留源视频有效结构，但主题、措辞和行动引导应从源视频证据出发，不要引入用户没有指定的商业场景。",
    "爆款原视频只能作为结构基准，不能作为声音、画面、数字人形象或素材基准。",
    "声音和视频生成必须优先遵循用户资产基准；没有用户资产时才使用标准模板。",
    "输出字段必须包含 baseline, originalStructure, title, script, tags, platforms, risks。",
  ].join("\n");

  const baseline = buildGenerationBaseline(input, extraction);

  const userPrompt = [
    `爆款链接：${input.url || "未提供"}`,
    `原始内容/口播：${input.originalText || "未提供"}`,
    `第一步提取结果：${extraction ? JSON.stringify(extraction) : "未提供，需自行根据原始内容提取"}`,
    `生成基准：${JSON.stringify(baseline)}`,
    `目标行业：${input.industry || "未指定；请参考源视频本身，不要默认餐饮或其他行业"}`,
    `IP风格：${input.persona || "未指定；保持自然口播风格"}`,
    `引流产品/服务：${input.offer || "未指定；结尾做轻量互动或关注引导，不要强行卖课"}`,
    `生成模式：${input.mode || "auto"}`,
    "",
    "请输出：",
    JSON.stringify({
      baseline,
      originalStructure: "原片结构拆解",
      title: "短视频标题",
      script: "口播文案，使用换行分段",
      tags: ["#标签1", "#标签2"],
      platforms: {
        douyin: "抖音发布文案",
        wechat: "视频号发布文案",
        red: "小红书发布文案",
      },
      risks: {
        lead: "私域引流风险检查",
        promise: "夸大承诺风险检查",
        repeat: "重复内容风险检查",
      },
    }),
  ].join("\n");

  let content = "";
  try {
    content = await callModel(
      [
        { role: "system", content: schemaPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        model: process.env.MODEL_NAME || "deepseek-v4-flash",
        temperature: Number(process.env.MODEL_TEMPERATURE || 0.7),
        maxTokens: Number(process.env.MODEL_REWRITE_MAX_TOKENS || 1400),
      }
    );
  } catch (error) {
    const fallback = buildRewriteFallback(input, error.message || "");
    return {
      ...fallback,
      source: "fallback",
      risks: {
        ...fallback.risks,
        repeat: `模型改写超时或失败，已使用${hasRewriteTarget ? "行业" : "源视频"}兜底模板。原因：${String(error.message || "").slice(0, 180)}`,
      },
    };
  }

  const parsed = parseJsonObject(content, () => buildRewriteFallback(input, content));
  const normalized = normalizeRewriteResult(parsed, input);
  const quality = validateRewriteQuality(normalized, input);
  if (quality.ok) {
    return normalized;
  }

  const repairPrompt = [
    hasRewriteTarget
      ? "上一次文案偏离了用户指定行业或产品，请严格重写。"
      : "上一次文案偏离了源视频证据，请严格参考源视频主题、画面和口播重写。",
    `必须聚焦行业：${input.industry || "未指定；不要默认餐饮、获客、AI培训等行业"}`,
    `必须符合人设：${input.persona || "未指定；保持自然口播风格"}`,
    `必须自然引出产品/服务：${input.offer || "未指定；不要强行卖课或引流"}`,
    `不得写这些偏题主题：${quality.forbiddenHits.join("、") || "无"}`,
    "仍然只输出同样 JSON schema，不要 Markdown。",
    `原提取结构：${JSON.stringify(extraction || {})}`,
    `上一版输出：${JSON.stringify(normalized)}`,
  ].join("\n");
  let repairedContent = "";
  try {
    repairedContent = await callModel(
      [
        { role: "system", content: schemaPrompt },
        { role: "user", content: repairPrompt },
      ],
      {
        model: process.env.MODEL_NAME || "deepseek-v4-flash",
        temperature: Math.min(0.4, Number(process.env.MODEL_TEMPERATURE || 0.7)),
        maxTokens: Number(process.env.MODEL_REWRITE_MAX_TOKENS || 1400),
      }
    );
  } catch (error) {
    const fallback = buildRewriteFallback(input, error.message || "");
    return {
      ...fallback,
      source: "fallback",
      risks: {
        ...fallback.risks,
        repeat: `模型修复改写失败，已使用${hasRewriteTarget ? "行业" : "源视频"}兜底模板。原因：${String(error.message || "").slice(0, 180)}`,
      },
    };
  }
  const repaired = normalizeRewriteResult(parseJsonObject(repairedContent, () => buildRewriteFallback(input, repairedContent)), input);
  const repairedQuality = validateRewriteQuality(repaired, input);
  if (!repairedQuality.ok) {
    const fallback = buildRewriteFallback(input, repairedContent);
    return {
      ...fallback,
      source: "fallback",
      risks: {
        ...fallback.risks,
        repeat: `模型改写连续偏题，已使用${hasRewriteTarget ? "行业" : "源视频"}兜底模板。问题：${repairedQuality.reasons.join("；")}`,
      },
    };
  }
  return {
    ...repaired,
    repaired: true,
    repairReason: quality.reasons.join("；"),
  };
}

async function synthesizeVoice(input = {}) {
  const script = String(input.script || input.generated?.script || "").trim();
  if (!script) {
    throwHttp(400, "缺少待配音脚本。");
  }
  const assets = input.assets || {};
  const provider = String(process.env.VOICE_PROVIDER || "").trim().toLowerCase();
  if (!provider) {
    throwHttp(
      501,
      "真人音色合成未配置。请配置 VOICE_PROVIDER 和对应 API Key；如果要克隆用户音色，需要先上传 voice 资产。"
    );
  }
  if (input.voiceBaseline?.includes("用户上传") && !assets.voice?.path && !assets.voice?.url) {
    throwHttp(400, "当前选择用户上传音色，但没有可用的声音样本资产。");
  }
  if (["qwen-tts", "qwen3-tts", "dashscope-qwen-tts"].includes(provider)) {
    return synthesizeWithQwenTts(input);
  }
  throwHttp(501, `VOICE_PROVIDER=${provider} 的真实调用适配器尚未实现，不能返回假音频。`);
}

async function synthesizeWithQwenTts(input = {}) {
  const apiKey = getDashScopeApiKey();
  const text = buildTtsText(input.script || input.generated?.script || "");
  if (!text) {
    throwHttp(400, "缺少可用于 TTS 的脚本文本。");
  }
  const model = String(process.env.QWEN_TTS_MODEL || "qwen3-tts-flash").trim();
  const voice = String(input.ttsVoice || process.env.QWEN_TTS_VOICE || "Cherry").trim();
  const baseUrl = String(process.env.DASHSCOPE_API_BASE_URL || "https://dashscope.aliyuncs.com").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: {
        text,
        voice,
        language_type: process.env.QWEN_TTS_LANGUAGE || "Chinese",
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status_code >= 400 || payload.code) {
    throwHttp(502, `Qwen-TTS 合成失败 ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  }
  const audioUrl = payload.output?.audio?.url;
  if (!audioUrl) {
    throwHttp(502, `Qwen-TTS 未返回音频 URL: ${JSON.stringify(payload).slice(0, 500)}`);
  }
  const asset = await downloadGeneratedAudioAsset(audioUrl, {
    name: `qwen-tts-${Date.now()}.wav`,
    source: `Qwen-TTS ${model}`,
    contentType: "audio/wav",
  });
  return {
    ok: true,
    provider: "qwen-tts",
    model,
    voice,
    id: asset.id,
    name: asset.name,
    url: asset.url,
    path: asset.path,
    contentType: asset.contentType,
    size: asset.size,
    sizeLabel: asset.sizeLabel,
    sourceUrl: audioUrl,
    expiresAt: payload.output?.audio?.expires_at || null,
    usage: payload.usage || null,
  };
}

function buildTtsText(script) {
  return String(script || "")
    .replace(/#[\p{Script=Han}\w-]+/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Number(process.env.QWEN_TTS_MAX_CHARS || 580));
}

async function downloadGeneratedAudioAsset(audioUrl, options = {}) {
  fs.mkdirSync(uploadDir, { recursive: true });
  const response = await fetch(audioUrl);
  if (!response.ok) {
    throwHttp(502, `下载 TTS 音频失败 ${response.status}: ${audioUrl}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throwHttp(502, "下载到的 TTS 音频为空。");
  }
  const contentType = response.headers.get("content-type") || options.contentType || "audio/wav";
  const ext = getSafeAssetExtension(options.name || "tts.wav", contentType);
  const id = `voice-tts-${crypto.randomUUID().slice(0, 8)}`;
  const storedName = `${id}${ext}`;
  const absolutePath = path.join(uploadDir, storedName);
  fs.writeFileSync(absolutePath, buffer);
  const asset = {
    id,
    kind: "voice",
    name: sanitizeFilename(options.name || storedName),
    storedName,
    contentType,
    size: buffer.length,
    sizeLabel: formatBytes(buffer.length),
    url: `/assets/uploads/${storedName}`,
    path: absolutePath,
    uploadedAt: new Date().toISOString(),
    source: options.source || "generated-tts",
    generated: true,
  };
  appendAssetManifest(asset);
  return asset;
}

function prepareWanDrivingAudioAsset(audioAsset, durationSeconds) {
  const maxSeconds = Math.min(30, Math.max(2, Number(durationSeconds) || 10));
  const wavInfo = inspectPcmWavFile(audioAsset.path);
  if (!wavInfo || wavInfo.durationSeconds <= maxSeconds + 0.15) {
    return {
      ...audioAsset,
      durationSeconds: wavInfo?.durationSeconds || null,
    };
  }

  const buffer = fs.readFileSync(audioAsset.path);
  const targetDataBytes = Math.max(
    wavInfo.blockAlign,
    Math.floor(maxSeconds * wavInfo.byteRate / wavInfo.blockAlign) * wavInfo.blockAlign
  );
  const dataBytes = Math.min(wavInfo.dataSize, targetDataBytes);
  const header = Buffer.from(buffer.slice(0, wavInfo.dataStart));
  header.writeUInt32LE(dataBytes, wavInfo.dataSizeOffset);
  header.writeUInt32LE(header.length + dataBytes - 8, 4);
  const trimmed = Buffer.concat([
    header,
    buffer.slice(wavInfo.dataStart, wavInfo.dataStart + dataBytes),
  ]);

  const id = `voice-wan-${crypto.randomUUID().slice(0, 8)}`;
  const storedName = `${id}.wav`;
  const absolutePath = path.join(uploadDir, storedName);
  fs.writeFileSync(absolutePath, trimmed);
  const asset = {
    id,
    kind: "voice",
    name: `${path.basename(audioAsset.name || audioAsset.storedName || "driving-audio", path.extname(audioAsset.name || audioAsset.storedName || ""))}-wan-${maxSeconds}s.wav`,
    storedName,
    contentType: "audio/wav",
    size: trimmed.length,
    sizeLabel: formatBytes(trimmed.length),
    url: `/assets/uploads/${storedName}`,
    path: absolutePath,
    uploadedAt: new Date().toISOString(),
    source: "prepared-wan-driving-audio",
    generated: true,
    preparedFrom: audioAsset.id || audioAsset.name || "",
    durationSeconds: dataBytes / wavInfo.byteRate,
  };
  appendAssetManifest(asset);
  return asset;
}

function inspectPcmWavFile(filePath) {
  if (!filePath || path.extname(filePath).toLowerCase() !== ".wav" || !fs.existsSync(filePath)) {
    return null;
  }
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    return null;
  }
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkId === "fmt " && chunkSize >= 16) {
      fmt = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        byteRate: buffer.readUInt32LE(chunkStart + 8),
        blockAlign: buffer.readUInt16LE(chunkStart + 12),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      };
    }
    if (chunkId === "data") {
      data = {
        dataStart: chunkStart,
        dataSize: Math.min(chunkSize, buffer.length - chunkStart),
        dataSizeOffset: offset + 4,
      };
      break;
    }
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }
  if (!fmt || !data || fmt.audioFormat !== 1 || !fmt.byteRate || !fmt.blockAlign) return null;
  return {
    ...fmt,
    ...data,
    durationSeconds: data.dataSize / fmt.byteRate,
  };
}

async function renderAvatarVideo(input = {}) {
  const script = String(input.script || input.generated?.script || "").trim();
  if (!script) {
    throwHttp(400, "缺少待生成视频脚本。");
  }
  const assets = input.assets || {};
  const provider = String(process.env.AVATAR_PROVIDER || process.env.VIDEO_PROVIDER || "").trim().toLowerCase();
  if (!provider) {
    throwHttp(
      501,
      "真人形象/数字人视频生成未配置。请配置 AVATAR_PROVIDER 或 VIDEO_PROVIDER；如果使用真人形象，需要先上传 video 资产。"
    );
  }
  if (input.videoBaseline?.includes("用户上传") && !assets.video?.path && !assets.video?.url) {
    throwHttp(400, "当前选择用户上传真人视频，但没有可用的真人视频资产。");
  }
  if (["wan2.7-i2v", "wan2.7-i2v-2026-04-25", "wan2.2-s2v", "wan-s2v", "dashscope-wan-s2v"].includes(provider)) {
    return renderWanDrivingVideo(input);
  }
  throwHttp(501, `AVATAR_PROVIDER=${provider} 的真实调用适配器尚未实现，不能返回假视频。`);
}

async function renderWanDrivingVideo(input = {}) {
  const assets = input.assets || {};
  const imageAsset = assets.video || assets.image || null;
  const audioAsset = input.audio?.path || input.audio?.url ? input.audio : assets.voice || null;
  if (!imageAsset?.path) {
    throwHttp(400, "wan2.7-i2v 需要用户上传真人形象首帧图片。当前没有可用 image/video 资产路径。");
  }
  if (!isImageAsset(imageAsset)) {
    throwHttp(400, "wan2.7-i2v 当前需要真人形象首帧图片；如果上传的是视频，需要先抽取一帧作为 first_frame。");
  }
  if (!audioAsset?.path) {
    throwHttp(400, "wan2.7-i2v 需要 driving_audio。请先生成配音音频，或上传 voice 音频用于通路测试。");
  }
  if (!isWanAudioAsset(audioAsset)) {
    throwHttp(400, "wan2.7-i2v 的 driving_audio 需要 WAV/MP3。请上传 wav/mp3，或先转码。");
  }

  const model = String(process.env.WAN_I2V_MODEL || process.env.WAN_S2V_MODEL || "wan2.7-i2v").trim();
  const durationPlan = buildWanDurationPlan(input);
  if (
    durationPlan.needsSegmentation &&
    parseBoolean(input.enableParallelSegments ?? process.env.WAN_PARALLEL_SEGMENTS, true)
  ) {
    return renderWanSegmentedVideo(input, { imageAsset, audioAsset, model, durationPlan });
  }
  const preparedAudioAsset = prepareWanDrivingAudioAsset(audioAsset, durationPlan.outputDurationSeconds);
  const [imageUpload, audioUpload] = await Promise.all([
    uploadLocalFileToDashScope(imageAsset.path, model),
    uploadLocalFileToDashScope(preparedAudioAsset.path, model),
  ]);
  const task = await createWanDrivingTask({
    imageUrl: imageUpload.ossUrl,
    audioUrl: audioUpload.ossUrl,
    resolution: input.resolution || process.env.WAN_S2V_RESOLUTION || process.env.WAN_I2V_RESOLUTION || "720P",
    duration: durationPlan.outputDurationSeconds,
    promptExtend: parseBoolean(input.promptExtend ?? process.env.WAN_PROMPT_EXTEND, true),
    watermark: parseBoolean(input.watermark ?? process.env.WAN_WATERMARK, false),
    seed: input.seed ?? process.env.WAN_SEED,
    prompt: input.prompt || input.generated?.title || input.generated?.script || "",
    model,
  });
  const pollTimeoutMs = Number(input.pollTimeoutMs ?? process.env.WAN_S2V_POLL_TIMEOUT_MS ?? 0);
  const result = pollTimeoutMs > 0
    ? await pollDashScopeTask(task.taskId, { timeoutMs: pollTimeoutMs })
    : null;
  const localVideo = result?.localVideoUrl
    ? result
    : result?.videoUrl
    ? await downloadGeneratedVideoAsset(result.videoUrl, { taskId: task.taskId, source: `wan2.7-i2v ${model}` }).catch((error) => ({
        error: error.message || String(error),
      }))
    : null;

  return {
    ok: true,
    provider: "wan2.7-i2v",
    model,
    status: result?.status || task.status || "PENDING",
    taskId: task.taskId,
    requestId: task.requestId,
    url: result?.videoUrl || "",
    videoUrl: result?.videoUrl || "",
    localVideoUrl: localVideo?.localVideoUrl || localVideo?.url || "",
    localVideoPath: localVideo?.localVideoPath || localVideo?.path || "",
    localVideoError: localVideo?.localVideoError || localVideo?.error || "",
    usage: result?.usage || null,
    parameters: task.parameters,
    durationPlan,
    inputs: {
      image: {
        assetId: imageAsset.id,
        name: imageAsset.name,
        ossUrl: imageUpload.ossUrl,
        expiresAt: imageUpload.expiresAt,
      },
      audio: {
        assetId: audioAsset.id,
        name: audioAsset.name,
        ossUrl: audioUpload.ossUrl,
        expiresAt: audioUpload.expiresAt,
        source: input.audio?.path ? "generated-audio" : "reference-audio-test",
        preparedAssetId: preparedAudioAsset.id,
        preparedName: preparedAudioAsset.name,
        preparedDurationSeconds: preparedAudioAsset.durationSeconds || null,
        preparedFrom: preparedAudioAsset.preparedFrom || null,
      },
    },
    note: result?.videoUrl
      ? localVideo?.localVideoUrl || localVideo?.url
        ? "wan2.7-i2v 已返回真实视频并已保存到本地 assets/outputs。"
        : "wan2.7-i2v 已返回真实视频 URL，但本地保存失败，请在 24 小时内下载保存。"
      : "wan2.7-i2v 任务已提交；配置 WAN_S2V_POLL_TIMEOUT_MS 可在服务端等待结果，或用任务 ID 查询。",
  };
}

async function renderWanSegmentedVideo(input = {}, context = {}) {
  const { imageAsset, audioAsset, model, durationPlan } = context;
  const sourceDuration = Number(durationPlan.sourceDurationSeconds || durationPlan.requestedDurationSeconds || 0);
  const maxSegmentSeconds = Number(durationPlan.maxSingleSegmentSeconds || 15);
  const segmentCount = Math.max(2, Math.min(
    Number(process.env.WAN_MAX_PARALLEL_SEGMENTS || 4),
    Math.ceil(sourceDuration / maxSegmentSeconds)
  ));
  const groupId = `wangroup-${crypto.randomUUID().slice(0, 8)}`;
  const segmentDurations = Array.from({ length: segmentCount }, (_, index) => {
    const remaining = Math.max(2, sourceDuration - index * maxSegmentSeconds);
    return getWanDurationSeconds(Math.min(maxSegmentSeconds, remaining));
  });

  const imageUpload = await uploadLocalFileToDashScope(imageAsset.path, model);
  const audioAssets = segmentDurations.map((duration) => prepareWanDrivingAudioAsset(audioAsset, duration));
  const audioUploads = await Promise.all(audioAssets.map((asset) => uploadLocalFileToDashScope(asset.path, model)));
  const promptBase = String(input.prompt || input.generated?.title || input.generated?.script || "").trim();
  const segmentTasks = await Promise.all(segmentDurations.map(async (duration, index) => {
    const task = await createWanDrivingTask({
      imageUrl: imageUpload.ossUrl,
      audioUrl: audioUploads[index].ossUrl,
      resolution: input.resolution || process.env.WAN_S2V_RESOLUTION || process.env.WAN_I2V_RESOLUTION || "720P",
      duration,
      promptExtend: parseBoolean(input.promptExtend ?? process.env.WAN_PROMPT_EXTEND, true),
      watermark: parseBoolean(input.watermark ?? process.env.WAN_WATERMARK, false),
      seed: Number(input.seed ?? process.env.WAN_SEED ?? 0) ? Number(input.seed ?? process.env.WAN_SEED) + index : undefined,
      prompt: [
        promptBase,
        `这是 ${segmentCount} 段成片中的第 ${index + 1} 段，保持同一真人形象、口播风格和画面连续感。`,
      ].filter(Boolean).join("\n"),
      model,
    });
    return {
      index,
      duration,
      status: task.status || "PENDING",
      taskId: task.taskId,
      requestId: task.requestId,
      parameters: task.parameters,
      audioAssetId: audioAssets[index].id,
      audioOssUrl: audioUploads[index].ossUrl,
    };
  }));

  const group = {
    ok: true,
    provider: "wan2.7-i2v",
    segmented: true,
    status: "PENDING",
    groupId,
    taskGroupId: groupId,
    model,
    createdAt: new Date().toISOString(),
    sourceDurationSeconds: sourceDuration,
    segmentCount,
    segments: segmentTasks,
    durationPlan: {
      ...durationPlan,
      outputDurationSeconds: segmentDurations.reduce((sum, value) => sum + value, 0),
      segmentDurations,
      reason: `原视频约 ${Math.round(sourceDuration)} 秒，已拆成 ${segmentCount} 个 Wan 任务并行生成。`,
    },
    inputs: {
      image: {
        assetId: imageAsset.id,
        name: imageAsset.name,
        ossUrl: imageUpload.ossUrl,
        expiresAt: imageUpload.expiresAt,
      },
    },
    note: "长视频已拆段并行提交；查询 taskGroupId 可获取各段结果。安装 ffmpeg 后可自动拼接为单个视频。",
  };
  videoTaskGroups.set(groupId, group);
  return group;
}

async function downloadGeneratedVideoAsset(videoUrl, options = {}) {
  const url = String(videoUrl || "").trim();
  if (!url) return null;
  fs.mkdirSync(outputDir, { recursive: true });
  const safeTask = sanitizeFilename(options.taskId || `wan-${Date.now()}`).replace(/\.[^.]+$/, "");
  const storedName = `${safeTask || `wan-${Date.now()}`}.mp4`;
  const absolutePath = path.join(outputDir, storedName);
  if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).size > 0) {
    return {
      url: `/assets/outputs/${storedName}`,
      path: absolutePath,
      size: fs.statSync(absolutePath).size,
      reused: true,
    };
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载 wan 视频失败 ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error("下载到的 wan 视频为空。");
  }
  fs.writeFileSync(absolutePath, buffer);
  return {
    url: `/assets/outputs/${storedName}`,
    path: absolutePath,
    size: buffer.length,
    sizeLabel: formatBytes(buffer.length),
    source: options.source || "wan2.7-i2v",
  };
}

async function createWanDrivingTask({ imageUrl, audioUrl, resolution, duration, promptExtend, watermark, seed, prompt, model }) {
  const apiKey = getDashScopeApiKey();
  const baseUrl = String(process.env.DASHSCOPE_API_BASE_URL || "https://dashscope.aliyuncs.com").replace(/\/+$/, "");
  const url = `${baseUrl}/api/v1/services/aigc/video-generation/video-synthesis`;
  const parameters = {
    resolution,
    duration,
    prompt_extend: promptExtend,
    watermark,
  };
  const numericSeed = Number(seed);
  if (Number.isInteger(numericSeed) && numericSeed >= 0 && numericSeed <= 2147483647) {
    parameters.seed = numericSeed;
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
      "X-DashScope-OssResourceResolve": "enable",
    },
    body: JSON.stringify({
      model,
      input: {
        prompt: String(prompt || "").slice(0, 800),
        media: [
          {
            type: "first_frame",
            url: imageUrl,
          },
          {
            type: "driving_audio",
            url: audioUrl,
          },
        ],
      },
      parameters,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throwHttp(502, `wan2.7-i2v 创建任务失败 ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  }
  const taskId = payload.output?.task_id;
  if (!taskId) {
    throwHttp(502, `wan2.7-i2v 未返回 task_id: ${JSON.stringify(payload).slice(0, 500)}`);
  }
  return {
    taskId,
    status: payload.output?.task_status || "PENDING",
    requestId: payload.request_id || "",
    parameters,
    raw: payload,
  };
}

async function pollDashScopeTask(taskId, options = {}) {
  const apiKey = getDashScopeApiKey();
  const baseUrl = String(process.env.DASHSCOPE_API_BASE_URL || "https://dashscope.aliyuncs.com").replace(/\/+$/, "");
  const timeoutMs = Number(options.timeoutMs || 0);
  const intervalMs = Math.max(3000, Number(options.intervalMs || process.env.WAN_S2V_POLL_INTERVAL_MS || 15000));
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const response = await fetch(`${baseUrl}/api/v1/tasks/${encodeURIComponent(taskId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throwHttp(502, `DashScope 查询任务失败 ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
    }
    const output = payload.output || {};
    const status = output.task_status || "UNKNOWN";
    if (status === "SUCCEEDED") {
      const videoUrl = output.video_url || output.results?.video_url || "";
      const localVideo = videoUrl
        ? await downloadGeneratedVideoAsset(videoUrl, { taskId }).catch((error) => ({ error: error.message || String(error) }))
        : null;
      return {
        status,
        videoUrl,
        localVideoUrl: localVideo?.url || "",
        localVideoPath: localVideo?.path || "",
        localVideoError: localVideo?.error || "",
        usage: payload.usage || null,
        raw: payload,
      };
    }
    if (["FAILED", "UNKNOWN", "CANCELED"].includes(status)) {
      throwHttp(502, `wan2.7-i2v 任务失败：${output.code || status} ${output.message || ""}`.trim());
    }
    await delay(intervalMs);
  }

  return {
    status: "PENDING",
    videoUrl: "",
    usage: null,
  };
}

async function getDashScopeTask(taskId) {
  if (!taskId) {
    throwHttp(400, "缺少 DashScope taskId。");
  }
  const apiKey = getDashScopeApiKey();
  const baseUrl = String(process.env.DASHSCOPE_API_BASE_URL || "https://dashscope.aliyuncs.com").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/api/v1/tasks/${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throwHttp(502, `DashScope 查询任务失败 ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  }
  const output = payload.output || {};
  const videoUrl = output.video_url || output.results?.video_url || "";
  const localVideo = videoUrl && output.task_status === "SUCCEEDED"
    ? await downloadGeneratedVideoAsset(videoUrl, { taskId }).catch((error) => ({ error: error.message || String(error) }))
    : null;
  return {
    ok: true,
    taskId,
    status: output.task_status || "UNKNOWN",
    requestId: payload.request_id || "",
    videoUrl,
    url: videoUrl,
    localVideoUrl: localVideo?.url || "",
    localVideoPath: localVideo?.path || "",
    localVideoError: localVideo?.error || "",
    usage: payload.usage || null,
    raw: payload,
  };
}

async function getVideoTaskGroup(groupId) {
  const group = videoTaskGroups.get(groupId);
  if (!group) {
    throwHttp(404, `未找到视频任务组：${groupId}`);
  }
  const checkedSegments = await Promise.all(group.segments.map(async (segment) => {
    if (segment.status === "SUCCEEDED" && (segment.localVideoUrl || segment.videoUrl)) return segment;
    try {
      const result = await getDashScopeTask(segment.taskId);
      return {
        ...segment,
        status: result.status,
        videoUrl: result.videoUrl || "",
        url: result.url || result.videoUrl || "",
        localVideoUrl: result.localVideoUrl || "",
        localVideoPath: result.localVideoPath || "",
        localVideoError: result.localVideoError || "",
        usage: result.usage || null,
        raw: result.raw || null,
      };
    } catch (error) {
      return {
        ...segment,
        status: "FAILED",
        error: error.message || String(error),
      };
    }
  }));
  group.segments = checkedSegments;
  const failed = checkedSegments.filter((segment) => ["FAILED", "CANCELED", "UNKNOWN"].includes(segment.status));
  const completed = checkedSegments.filter((segment) => segment.status === "SUCCEEDED" && (segment.localVideoPath || segment.localVideoUrl || segment.videoUrl));
  group.status = failed.length
    ? "FAILED"
    : completed.length === checkedSegments.length
      ? "SUCCEEDED"
      : "RUNNING";

  if (group.status === "SUCCEEDED" && !group.localVideoUrl) {
    const stitched = await stitchSegmentVideos(group).catch((error) => ({ error: error.message || String(error) }));
    if (stitched?.url) {
      group.localVideoUrl = stitched.url;
      group.localVideoPath = stitched.path;
      group.stitched = true;
    } else {
      group.stitchError = stitched?.error || "ffmpeg unavailable";
    }
  }

  videoTaskGroups.set(groupId, group);
  return {
    ...group,
    ok: true,
    url: group.localVideoUrl || "",
    videoUrl: group.localVideoUrl || "",
  };
}

async function stitchSegmentVideos(group) {
  const ffmpegPath = findExecutable("ffmpeg");
  if (!ffmpegPath) {
    throw new Error("未找到 ffmpeg，已完成多段视频但不能自动拼接。");
  }
  const paths = group.segments
    .sort((a, b) => a.index - b.index)
    .map((segment) => segment.localVideoPath)
    .filter(Boolean);
  if (paths.length !== group.segments.length) {
    throw new Error("分段视频尚未全部保存到本地。");
  }
  fs.mkdirSync(outputDir, { recursive: true });
  const listPath = path.join(outputDir, `${sanitizeFilename(group.groupId)}-concat.txt`);
  const outName = `${sanitizeFilename(group.groupId)}-stitched.mp4`;
  const outPath = path.join(outputDir, outName);
  const listText = paths.map((item) => `file '${item.replace(/'/g, "'\\''")}'`).join("\n");
  fs.writeFileSync(listPath, listText, "utf8");
  const result = spawnSync(ffmpegPath, [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-c", "copy",
    outPath,
  ], { encoding: "utf8" });
  if (result.status !== 0 || !fs.existsSync(outPath) || fs.statSync(outPath).size <= 0) {
    throw new Error(`ffmpeg 拼接失败：${(result.stderr || result.stdout || "").slice(0, 500)}`);
  }
  return {
    url: `/assets/outputs/${outName}`,
    path: outPath,
  };
}

async function finalizeVideo(input = {}) {
  const audio = input.audio || null;
  const avatar = input.avatar || null;
  const provider = String(process.env.VIDEO_RENDER_PROVIDER || "ffmpeg").trim().toLowerCase();
  if (!audio?.url && !audio?.path) {
    throwHttp(400, "缺少真实音频产物，不能合成最终视频。");
  }
  if (!avatar?.url && !avatar?.path) {
    throwHttp(400, "缺少真实视频产物，不能合成最终视频。");
  }
  if (provider !== "ffmpeg") {
    throwHttp(501, `VIDEO_RENDER_PROVIDER=${provider} 的真实调用适配器尚未实现。`);
  }
  const ffmpegPath = findExecutable("ffmpeg");
  if (!ffmpegPath) {
    throwHttp(501, "未找到 ffmpeg，不能在本机合成最终视频。");
  }
  throwHttp(501, "最终合成需要真实 audio/video 产物后再执行；当前上游产物未生成。");
}

async function callModel(messages, options = {}) {
  ensureModelConfigured();

  const baseUrl = getModelBaseUrl().replace(/\/+$/, "");
  const endpoint = process.env.MODEL_CHAT_PATH || "/chat/completions";
  const url = `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const model = options.model || process.env.MODEL_NAME || "deepseek-v4-flash";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getModelApiKey()}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? Number(process.env.MODEL_TEMPERATURE || 0.7),
      max_tokens: options.maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throwHttp(502, `Model API error ${response.status}: ${detail.slice(0, 500)}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throwHttp(502, "Model API returned no message content.");
  }

  return content;
}

function getModelFrameDataUrls(frameDataUrls = []) {
  const maxFrames = Math.max(1, Math.min(Number(process.env.MODEL_FRAME_MAX_COUNT || 3), 6));
  const maxChars = Math.max(40_000, Number(process.env.MODEL_FRAME_MAX_CHARS || 220_000));
  return frameDataUrls
    .filter(Boolean)
    .slice(0, maxFrames)
    .map((url) => String(url).slice(0, maxChars))
    .filter((url) => url.startsWith("data:image/"));
}

function normalizeExtractInput(input = {}) {
  return {
    url: String(input.url || "").trim(),
    sourceText: String(input.sourceText || input.originalText || "").trim(),
    imageUrl: String(input.imageUrl || "").trim(),
    videoUrl: String(input.videoUrl || "").trim(),
    industry: String(input.industry || "").trim(),
    persona: String(input.persona || "").trim(),
    offer: String(input.offer || "").trim(),
    mode: String(input.mode || "auto").trim(),
    capture: input.capture || null,
    frameDataUrls: Array.isArray(input.frameDataUrls) ? input.frameDataUrls.filter(Boolean) : [],
  };
}

function buildGenerationBaseline(input = {}, extraction = null) {
  const assets = input.assets || {};
  const assetNotes = [
    assets.voice?.name ? `声音样本：${assets.voice.name} (${assets.voice.sizeLabel || assets.voice.type || "file"})` : "",
    assets.video?.name ? `真人视频：${assets.video.name} (${assets.video.sizeLabel || assets.video.type || "file"})` : "",
    assets.history?.name ? `历史作品：${assets.history.name} (${assets.history.sizeLabel || assets.history.type || "file"})` : "",
  ].filter(Boolean).join("；");
  const notes = [String(input.assetNotes || "").trim(), assetNotes].filter(Boolean).join("；") || "未补充用户资产说明";

  return {
    structure: extraction?.reusablePattern ? "爆款视频结构拆解" : "爆款链接/口播结构参考",
    voice: String(input.voiceBaseline || "标准TTS音色").trim(),
    video: String(input.videoBaseline || "标准数字人模板").trim(),
    notes,
    policy: "爆款原视频只作为结构参考，不复用原声、原画面或原话术。",
  };
}

function normalizeExtractResult(result, input) {
  const fallback = buildExtractFallback(input);
  const hook = typeof result.hook === "object" && result.hook ? result.hook : fallback.hook;
  const conversionPoint =
    typeof result.conversionPoint === "object" && result.conversionPoint
      ? result.conversionPoint
      : fallback.conversionPoint;

  return {
    source: String(result.source || "model"),
    summary: String(result.summary || fallback.summary),
    hook: {
      text: String(hook.text || fallback.hook.text),
      type: String(hook.type || fallback.hook.type),
      whyItWorks: String(hook.whyItWorks || fallback.hook.whyItWorks),
    },
    structure: Array.isArray(result.structure) && result.structure.length
      ? result.structure.map((item, index) => ({
          stage: String(item.stage || `阶段 ${index + 1}`),
          purpose: String(item.purpose || ""),
          originalCue: String(item.originalCue || ""),
          reusableRule: String(item.reusableRule || ""),
        }))
      : fallback.structure,
    emotionCurve: Array.isArray(result.emotionCurve)
      ? result.emotionCurve.map(String)
      : fallback.emotionCurve,
    conversionPoint: {
      action: String(conversionPoint.action || fallback.conversionPoint.action),
      wordingRisk: String(conversionPoint.wordingRisk || fallback.conversionPoint.wordingRisk),
      saferRewrite: String(conversionPoint.saferRewrite || fallback.conversionPoint.saferRewrite),
    },
    reusablePattern: String(result.reusablePattern || fallback.reusablePattern),
    risks: {
      copycat: String(result.risks?.copycat || fallback.risks.copycat),
      promise: String(result.risks?.promise || fallback.risks.promise),
      lead: String(result.risks?.lead || fallback.risks.lead),
      fit: String(result.risks?.fit || fallback.risks.fit),
    },
    evidence: Array.isArray(result.evidence) ? result.evidence.map(String) : fallback.evidence,
    confidence: clampNumber(Number(result.confidence), 0.1, 0.99, fallback.confidence),
  };
}

function normalizeRewriteResult(result, input) {
  const fallback = buildRewriteFallback(input);
  const baseline = typeof result.baseline === "object" && result.baseline
    ? result.baseline
    : fallback.baseline || buildGenerationBaseline(input, input.extraction || null);
  const rawTitle = String(result.title || fallback.title);
  const title = sanitizeGeneratedCopy(rawTitle);
  const rawScript = String(result.script || fallback.script);
  const script = sanitizeGeneratedCopy(rawScript);
  const tags = Array.isArray(result.tags) ? result.tags.map(String) : fallback.tags;
  const platforms = result.platforms || {};
  const rawPlatformCopies = {
    douyin: String(platforms.douyin || `${title}\n\n${rawScript}\n\n${tags.join(" ")}`),
    wechat: String(platforms.wechat || fallback.platforms.wechat),
    red: String(platforms.red || fallback.platforms.red),
  };
  const sanitizedPlatformCopies = {
    douyin: sanitizeGeneratedCopy(rawPlatformCopies.douyin),
    wechat: sanitizeGeneratedCopy(rawPlatformCopies.wechat),
    red: sanitizeGeneratedCopy(rawPlatformCopies.red),
  };
  const sanitized = rawTitle !== title ||
    rawScript !== script ||
    rawPlatformCopies.douyin !== sanitizedPlatformCopies.douyin ||
    rawPlatformCopies.wechat !== sanitizedPlatformCopies.wechat ||
    rawPlatformCopies.red !== sanitizedPlatformCopies.red;

  return {
    source: "model",
    baseline: {
      structure: String(baseline.structure || "爆款结构参考"),
      voice: String(baseline.voice || "标准TTS音色"),
      video: String(baseline.video || "标准数字人模板"),
      notes: String(baseline.notes || "未补充用户资产说明"),
      policy: String(baseline.policy || "爆款原视频只作为结构参考，不复用原声原画面。"),
    },
    originalStructure: String(result.originalStructure || fallback.originalStructure),
    title,
    script,
    tags,
    platforms: sanitizedPlatformCopies,
    risks: {
      lead: sanitized
        ? "已清洗：高风险转化话术已替换为低风险主页案例表达。"
        : sanitizeGeneratedCopy(String(result.risks?.lead || fallback.risks.lead)),
      promise: sanitized
        ? "已清洗：确定倍率、绝对转化等夸大表达已改为概率型表述。"
        : sanitizeGeneratedCopy(String(result.risks?.promise || fallback.risks.promise)),
      repeat: sanitizeGeneratedCopy(String(result.risks?.repeat || fallback.risks.repeat)),
    },
  };
}

function sanitizeExtractionForRewrite(extraction) {
  if (!extraction || typeof extraction !== "object") return null;
  const safe = {};
  const keepString = (key, max = 1600) => {
    if (extraction[key] !== undefined && extraction[key] !== null) {
      safe[key] = String(extraction[key]).slice(0, max);
    }
  };
  keepString("source", 120);
  keepString("summary", 1200);
  keepString("reusablePattern", 1000);
  safe.hook = compactObject(extraction.hook, 1000);
  safe.structure = compactArray(extraction.structure, 6, 1000);
  safe.emotionCurve = compactArray(extraction.emotionCurve, 8, 500);
  safe.conversionPoint = compactObject(extraction.conversionPoint, 1000);
  safe.risks = compactObject(extraction.risks, 1000);
  safe.evidence = compactArray(extraction.evidence, 8, 800);
  if (Number.isFinite(Number(extraction.confidence))) {
    safe.confidence = Number(extraction.confidence);
  }

  const capture = extraction.capture || null;
  if (capture && typeof capture === "object") {
    safe.capture = {
      source: String(capture.source || "").slice(0, 120),
      title: String(capture.title || "").slice(0, 160),
      finalUrl: String(capture.finalUrl || capture.url || "").slice(0, 300),
      frameCount: Array.isArray(capture.frameDataUrls) ? capture.frameDataUrls.length : 0,
      videoTarget: compactObject(capture.videoTarget, 600),
      durationSeconds: Number(capture.durationSeconds || capture.duration || capture.videoTarget?.duration || 0) || 0,
      hasAudio: Boolean(capture.audioAsset?.url || capture.audioAsset?.path || capture.audioDataUrl),
      transcript: String(capture.transcript || capture.asr?.text || "").slice(0, 1600),
    };
  }
  return safe;
}

function compactObject(value, maxChars = 1000) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value === undefined ? null : String(value).slice(0, maxChars);
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null) continue;
    if (typeof item === "object") {
      result[key] = JSON.stringify(item).slice(0, maxChars);
    } else {
      result[key] = String(item).slice(0, maxChars);
    }
  }
  return result;
}

function compactArray(value, maxItems = 8, maxChars = 800) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((item) => {
    if (item && typeof item === "object") return compactObject(item, maxChars);
    return String(item).slice(0, maxChars);
  });
}

function validateRewriteQuality(result = {}, input = {}) {
  const industry = String(input.industry || "").trim();
  const offer = String(input.offer || "").trim();
  const fullText = [
    result.title,
    result.script,
    Array.isArray(result.tags) ? result.tags.join(" ") : "",
    result.platforms?.douyin,
    result.platforms?.wechat,
    result.platforms?.red,
  ].filter(Boolean).join("\n");
  const reasons = [];
  const forbiddenHits = [];

  if (!fullText.trim()) {
    reasons.push("empty rewrite result");
  }

  if (industry) {
    const industryTerms = getIndustryTerms(industry);
    const hits = industryTerms.filter((term) => fullText.includes(term));
    if (hits.length < Math.min(2, industryTerms.length)) {
      reasons.push(`rewrite does not anchor to target industry: ${industry}`);
    }
  }

  const offerTerms = getOfferTerms(offer);
  if (offerTerms.length && !offerTerms.some((term) => fullText.includes(term))) {
    reasons.push("rewrite does not mention or naturally imply the target offer");
  }

  const genericForbidden = [
    "AI副业",
    "副业",
    "躺赚",
    "月入",
    "死工资",
    "暴富",
    "稳赚",
    "保底",
    "稳赚不赔",
    "一夜",
    "免费AI",
    "免费诊断",
    "免费分析",
    "爆单",
    "疯狂响",
    "稳赚不赔",
    "保赚",
    "日排",
    "上万家",
    "两步就能搞定",
    "直接把客人吸引到店",
    "精准找出",
    ];
  for (const term of genericForbidden) {
    if (fullText.includes(term) && !industry.includes(term) && !offer.includes(term)) {
      forbiddenHits.push(term);
    }
  }
  if (forbiddenHits.length) {
    reasons.push(`off-topic or high-risk terms: ${forbiddenHits.join(", ")}`);
  }

  const script = String(result.script || "");
  if (script.length < 60) {
    reasons.push("script is too short for a publishable short video");
  }

  return {
    ok: reasons.length === 0,
    reasons,
    forbiddenHits,
  };
}

function getIndustryTerms(industry) {
  const text = String(industry || "");
  const terms = new Set([text]);
  const presets = [
    [/餐饮|饭店|餐厅|小吃|火锅|烘焙|咖啡|茶饮/, ["餐饮", "门店", "顾客", "到店", "菜品", "外卖", "翻台", "同城", "老板"]],
    [/美业|美容|美甲|医美|皮肤/, ["美业", "门店", "顾客", "到店", "项目", "复购", "同城", "老板"]],
    [/教培|教育|培训|课程/, ["教培", "课程", "家长", "学员", "招生", "试听", "转化"]],
    [/房产|装修|家居/, ["房产", "装修", "客户", "咨询", "案例", "同城", "成交"]],
    [/本地|同城|门店/, ["同城", "门店", "顾客", "到店", "老板", "转化"]],
  ];
  for (const [pattern, values] of presets) {
    if (pattern.test(text)) values.forEach((term) => terms.add(term));
  }
  return Array.from(terms).filter(Boolean);
}

function getOfferTerms(offer) {
  const raw = String(offer || "").trim();
  if (!raw) return [];
  const terms = new Set([raw]);
  raw
    .split(/[^\p{Script=Han}A-Za-z0-9]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .forEach((term) => terms.add(term));
  const semantic = raw.match(/AI|获客|诊断|引流|线索|私域|成交|到店|咨询|课程|训练营|陪跑|方案/gi) || [];
  semantic
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 || term.toUpperCase() === "AI")
    .forEach((term) => terms.add(term));
  return Array.from(terms).filter(Boolean);
}

function sanitizeGeneratedCopy(text) {
  return String(text || "")
    .replace(/连厨师都跑了[，,]?外卖单却还在?疯狂响/g, "生意不只靠后厨，获客效率也很关键")
    .replace(/外卖单却还在?疯狂响/g, "外卖订单更稳定")
    .replace(/疯狂响/g, "持续有反馈")
    .replace(/爆单/g, "获客改善")
    .replace(/两步就能搞定/g, "两步先把方向理清")
    .replace(/两步就能破局/g, "两步先找到突破口")
    .replace(/轻松获客/g, "更有方法地做获客")
    .replace(/轻松破局/g, "更清晰地破局")
    .replace(/直接把客人吸引到店/g, "更有机会吸引顾客到店")
    .replace(/精准找出/g, "辅助定位")
    .replace(/精准摸清/g, "初步梳理")
    .replace(/精准锁客/g, "更清楚地识别目标顾客")
    .replace(/一键生成爆款文案/g, "快速生成候选文案")
    .replace(/一键生成方案/g, "快速生成候选方案")
    .replace(/日排\s*\d+\s*桌/g, "到店情况不错")
    .replace(/排队排到腿软/g, "排队情况明显")
    .replace(/天天喝茶[^，。；\n]*排队[^，。；\n]*/g, "不用只靠低效忙碌，也能把获客动作做得更清楚")
    .replace(/我花了[一二三四五六七八九十\d]+年[，,]?/g, "我拆过不少案例，")
    .replace(/拆解了[上数几十百千万\d.]+家[^，。；\n]*/g, "拆过不少同类型门店案例")
    .replace(/[上数几十百千万\d.]+家餐饮店的后台数据/g, "一些餐饮门店的经营案例")
    .replace(/\d+(\.\d+)?\s*%的利润[^，。；\n]*/g, "利润往往不只在单一环节")
    .replace(/\d+(\.\d+)?\s*%/g, "一定比例")
    .replace(/必然|一定能|肯定能/g, "有机会")
    .replace(/免费\s*AI\s*获客诊断/gi, "基础AI获客诊断")
    .replace(/免费\s*AI\s*诊断/gi, "基础AI诊断")
    .replace(/曝光提升了?\s*\d+(\.\d+)?\s*%/g, "曝光效率有机会改善")
    .replace(/转化提升了?\s*\d+(\.\d+)?\s*%/g, "转化效率有机会改善")
    .replace(/提升了?\s*\d+(\.\d+)?\s*%/g, "有机会改善")
    .replace(/增长了?\s*\d+(\.\d+)?\s*%/g, "有机会增长")
    .replace(/主页有[^。\n]{0,20}入口/g, "可以点主页看案例")
    .replace(/点进去看看/g, "先看案例")
    .replace(/私信我领取/g, "点主页看案例")
    .replace(/私信我/g, "点主页看案例")
    .replace(/我私信发你[^，。；\n]*/g, "可以点主页看案例")
    .replace(/私信发你[^，。；\n]*/g, "点主页看案例")
    .replace(/私信[^，。；\n]*(链接|资料|课程|诊断课)/g, "点主页看案例")
    .replace(/回复[‘’“”"']?[^，。；\n]{1,12}[‘’“”"']?[，,]?我发你[^，。；\n]*/g, "点主页看案例")
    .replace(/回复[‘’“”"']?诊断[‘’“”"']?/g, "点主页看案例")
    .replace(/我发你[^，。；\n]*/g, "可以点主页看案例")
    .replace(/评论区交流[，,。；\n]?发你[^，。；\n]*/g, "点主页看案例")
    .replace(/评论区交流[^，。；\n]*(发你|资料|链接|诊断)[^，。；\n]*/g, "点主页看案例")
    .replace(/评论区打[‘’“”"']?[^，。；\n]{1,12}[‘’“”"']?[^，。；\n]*/g, "点主页看案例")
    .replace(/评论[“"']?诊断[”"']?/g, "评论区交流")
    .replace(/评论区回复[“"']?诊断[”"']?/g, "评论区交流")
    .replace(/评论区暗号/g, "评论区交流")
    .replace(/评论区扣[‘’“”"']?[^，。；\n]{1,12}[‘’“”"']?/g, "评论区交流")
    .replace(/评论区扣\s*1\s*领/g, "评论区交流")
    .replace(/评论区扣\s*1/g, "评论区交流")
    .replace(/免费帮你分析一次/g, "可以先看一套分析案例")
    .replace(/免费分析/g, "看分析案例")
    .replace(/免费诊断/g, "基础诊断")
    .replace(/每天限\s*\d+\s*个名额/g, "名额以实际排期为准")
    .replace(/每日仅限\s*\d+\s*位/g, "名额以实际排期为准")
    .replace(/加微信|加微|留电话|留联系方式/g, "看主页案例")
    .replace(/帮你搞定/g, "辅助你梳理")
    .replace(/转化率提升\s*\d+(\.\d+)?\s*倍/g, "转化效率有机会提升")
    .replace(/翻台率翻倍/g, "翻台效率有机会改善")
    .replace(/翻倍/g, "有机会改善")
    .replace(/播放量[几数十百千万\d.]+万/g, "播放表现较好")
    .replace(/播放量\s*\d+(\.\d+)?/g, "播放表现一般")
    .replace(/原片播放表现一般/g, "原片播放表现一般")
    .replace(/几乎看不出区别/g, "能接近目标表达")
    .replace(/涨了\s*\d+(\.\d+)?%/g, "出现改善")
    .replace(/增长\s*\d+(\.\d+)?%/g, "出现阶段性改善")
    .replace(/\d+(\.\d+)?\s*秒钟/g, "短时间内")
    .replace(/提升\s*\d+(\.\d+)?%/g, "有所改善")
    .replace(/从\s*\d+(\.\d+)?\s*提到\s*\d+(\.\d+)?/g, "出现阶段性改善")
    .replace(/提升\s*\d+(\.\d+)?\s*倍/g, "有机会提升")
    .replace(/不足\s*\d+(\.\d+)?%/g, "效果不稳定")
    .replace(/必涨粉|必爆单|稳赚|保底收益/g, "需要结合账号实际情况验证");
}

function buildUrlOnlyExtractResult(input) {
  return {
    source: "url-only",
    summary: "当前只拿到了抖音链接，未拿到口播、字幕或画面，因此不能可靠判断原视频结构。",
    hook: {
      text: "待提取：请补充口播/字幕，或上传封面/截图 URL。",
      type: "素材不足",
      whyItWorks: "只有链接无法验证开场钩子，继续生成会变成模型猜测。",
    },
    structure: [
      {
        stage: "素材获取",
        purpose: "确认视频可分析内容",
        originalCue: input.url,
        reusableRule: "先获取字幕、口播、关键帧或人工观察，再进入爆款结构拆解。",
      },
    ],
    emotionCurve: ["待获取素材"],
    conversionPoint: {
      action: "待判断",
      wordingRisk: "未看到原片转化话术，不能判断风险。",
      saferRewrite: "补充口播或截图后再生成稳妥转化表达。",
    },
    reusablePattern: "素材不足，暂不生成爆款骨架",
    risks: {
      copycat: "无法判断：未拿到原片内容。",
      promise: "无法判断：未拿到原片承诺表达。",
      lead: "无法判断：未拿到原片转化话术。",
      fit: `${input.industry || "目标行业"}适配需要基于真实视频内容判断。`,
    },
    evidence: [
      `已收到链接：${input.url}`,
      "普通 HTTP 抓取未获得可用标题、字幕或视频描述。",
      "为避免幻觉，本次未让模型根据链接猜测视频内容。",
    ],
    confidence: 0.18,
  };
}

function buildExtractFallback(input, raw = "") {
  const industry = input.industry || "目标行业";
  const persona = input.persona || "商业增长顾问";

  return {
    source: "fallback",
    summary: "这个内容的核心有效点是：用强痛点开场，快速展示自动化过程，再用结果对比制造信任。",
    hook: {
      text: "如果你不会拍摄、不会剪辑，又在做生意，这个流程一定要看完。",
      type: "痛点 + 身份筛选",
      whyItWorks: "先筛出有内容焦虑的商家，再承诺降低门槛，能快速留下目标用户。",
    },
    structure: [
      {
        stage: "痛点开场",
        purpose: "让不会拍摄、不会剪辑的商家立刻对号入座",
        originalCue: "不会拍摄不会剪辑，又是在做生意",
        reusableRule: `${industry}内容开头要先点出老板最真实的获客焦虑。`,
      },
      {
        stage: "爆款参照",
        purpose: "借已有热视频降低信任成本",
        originalCue: "刷到这条视频很火，点赞量几万",
        reusableRule: "用热门案例做参照，但不要搬运原话，只复用结构。",
      },
      {
        stage: "自动化演示",
        purpose: "把复杂工作压缩成一个可视化流程",
        originalCue: "按一下自动化提取，文案、改写、音频、数字人依次执行",
        reusableRule: `${persona}口吻要强调流程可控，而不是神化 AI。`,
      },
      {
        stage: "结果对比",
        purpose: "用前后对比证明工具有效",
        originalCue: "原片和做出来的视频来一个对比",
        reusableRule: "展示改写前后的差异，让用户看到行业化价值。",
      },
      {
        stage: "行动引导",
        purpose: "引导用户进入下一步咨询或直播间",
        originalCue: "想用点我头像进直播间",
        reusableRule: "转化表达要做软引导，避免直接要求留联系方式。",
      },
    ],
    emotionCurve: ["被戳中", "好奇", "惊讶", "相信", "想尝试"],
    conversionPoint: {
      action: `了解${input.offer || "AI获客诊断课"}`,
      wordingRisk: "直接说进直播间或留联系方式有平台风险。",
      saferRewrite: "想看你的行业能不能这样做，可以先点头像看案例。",
    },
    reusablePattern: "痛点筛选 -> 爆款参照 -> 一键流程演示 -> 结果对比 -> 低风险行动引导",
    risks: {
      copycat: "不能复制原片话术和画面，应只复用结构。",
      promise: "避免承诺三秒出片、必涨粉、必获客等确定结果。",
      lead: "避免直接引导私信、加微信、留电话。",
      fit: `${industry}场景需要补充真实业务痛点，否则会像通用 AI 工具广告。`,
    },
    evidence: raw ? [`模型未返回标准 JSON，原始输出：${String(raw).slice(0, 180)}`] : ["使用默认示例口播和业务场景推断"],
    confidence: 0.68,
  };
}

function buildRewriteFallback(input, raw = "") {
  const hasRewriteTarget = Boolean(String(input.industry || input.persona || input.offer || "").trim());
  if (!hasRewriteTarget) {
    const extraction = input.extraction || {};
    const hookText = extraction.hook?.text || "这个画面第一眼就让人停下来";
    const pattern = extraction.reusablePattern || "强画面开场 -> 反差解释 -> 方法拆解 -> 轻量互动";
    const title = extraction.summary
      ? String(extraction.summary).slice(0, 30)
      : "这个视频为什么容易让人看完？";
    const script = [
      hookText,
      "很多视频让人停下来，不是因为它讲得多复杂，而是第一眼就给了一个明确的反差。",
      `这条内容可以复用的结构是：${pattern}`,
      "如果你也想拍同类内容，不要照搬画面和原话，先把开场冲击、节奏变化和最后的互动点拆出来，再换成自己的真实表达。",
      "你觉得这类视频最抓人的地方是哪一秒？可以先记下来。"
    ].join("\n\n");
    const tags = ["#短视频拆解", "#内容结构", "#个人IP"];
    const baseline = buildGenerationBaseline(input, extraction);
    return {
      source: "fallback",
      baseline,
      originalStructure: pattern,
      title,
      script,
      tags,
      platforms: {
        douyin: `${title}\n\n${script}\n\n${tags.join(" ")}`,
        wechat: `今天拆一条短视频结构：\n\n${script}`,
        red: `${title}\n\n可复用点：\n1. 开场先给反差\n2. 中段解释为什么有效\n3. 结尾做轻量互动\n\n${tags.join(" ")}`
      },
      risks: {
        lead: "通过：未强行引导私域或卖课。",
        promise: "通过：未承诺确定收益。",
        repeat: raw ? "待人工复核：模型输出异常，已按源视频结构兜底。" : "通过：参考源视频结构，未默认迁移到餐饮或获客。"
      }
    };
  }

  const industry = input.industry || "目标行业";
  const persona = input.persona || "商业增长顾问";
  const offer = input.offer || "AI获客诊断课";
  const title = `${industry}老板别再硬熬内容了，先把爆款结构自动拆出来`;
  const script = [
    `【${persona}口吻】很多${industry}老板不是不适合做个人 IP，而是被拍摄、剪辑和文案卡住了。`,
    "爆款内容真正值得复用的不是原话，而是结构：先抓痛点，再给判断，再展示一个具体动作，最后把用户带到下一步。",
    `现在这套智能体会先拆爆款，再改成你的行业表达，最后生成可发布的内容包。想看你的账号适合怎么改，可以先了解${offer}。`,
  ].join("\n\n");
  const tags = [`#${industry}`, "#个人IP", "#AI获客", "#短视频运营"];
  const baseline = buildGenerationBaseline(input, input.extraction || null);

  return {
    source: "fallback",
    baseline,
    originalStructure: input.extraction?.reusablePattern || "痛点开场 -> 爆款参照 -> 自动化演示 -> 结果对比 -> 行动引导",
    title,
    script,
    tags,
    platforms: {
      douyin: `${title}\n\n${script}\n\n${tags.join(" ")}`,
      wechat: `今天拆一个${industry}老板很容易忽略的问题：内容生产不是靠灵感硬撑，而是要把爆款结构流程化。\n\n${script}`,
      red: `${title}\n\n适合${industry}账号的内容打法：\n1. 拆爆款结构\n2. 改成行业表达\n3. 生成发布内容包\n\n${tags.join(" ")}`,
    },
    risks: {
      lead: "待人工复核：已使用低风险软引导表达。",
      promise: "通过：未承诺确定收益。",
      repeat: raw ? "待人工复核：模型输出异常，已使用兜底改写。" : "通过：已按行业重新组织表达。",
    },
  };
}

function findBrowserExecutable() {
  const configured = process.env.BROWSER_EXECUTABLE;
  if (configured && fs.existsSync(configured)) {
    return configured;
  }

  const candidates = process.platform === "win32"
    ? [
        path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Google\\Chrome\\Application\\chrome.exe"),
        path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google\\Chrome\\Application\\chrome.exe"),
        path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
        path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Microsoft\\Edge\\Application\\msedge.exe"),
        path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Microsoft\\Edge\\Application\\msedge.exe"),
      ]
    : [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
        "/usr/bin/microsoft-edge",
      ];

  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function findExecutable(name) {
  const command = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(command, [name], { encoding: "utf8" });
  if (result.status !== 0) return null;
  return String(result.stdout || "").split(/\r?\n/).map((item) => item.trim()).find(Boolean) || null;
}

function getBrowserProfileDir() {
  return process.env.BROWSER_PROFILE_DIR || path.join(rootDir, ".browser-profile");
}

async function waitForCdpPage(port, targetUrl) {
  const deadline = Date.now() + 15_000;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const pageWsUrl = await findCdpPage(port, targetUrl);
      if (pageWsUrl) return pageWsUrl;
    } catch (error) {
      lastError = error;
    }

    await delay(350);
  }

  throwHttp(504, `登录态浏览器调试端口启动超时：${lastError?.message || "no page target"}`);
}

async function findCdpPage(port, targetUrl) {
  const response = await fetch(`http://127.0.0.1:${port}/json`);
  if (!response.ok) {
    throw new Error(`CDP list failed: ${response.status}`);
  }
  const pages = await response.json();
  const candidates = pages.filter((item) => item.type === "page" && item.webSocketDebuggerUrl);
  const page =
    candidates.find((item) => isLikelyTargetPage(item.url, targetUrl)) ||
    candidates.find((item) => item.url.includes("douyin.com")) ||
    candidates.find((item) => item.url.startsWith("about:blank")) ||
    candidates[0];

  return page?.webSocketDebuggerUrl || null;
}

function isLikelyTargetPage(currentUrl, targetUrl) {
  if (!currentUrl) return false;
  if (currentUrl === targetUrl) return true;
  if (!currentUrl.includes("douyin.com")) return false;

  try {
    const current = new URL(currentUrl);
    const target = new URL(targetUrl);
    const currentModal = current.searchParams.get("modal_id");
    const targetModal = target.searchParams.get("modal_id");
    return Boolean(currentModal && targetModal && currentModal === targetModal);
  } catch {
    return false;
  }
}

async function getCurrentPageUrl(page) {
  const result = await page.call("Runtime.evaluate", {
    returnByValue: true,
    expression: "location.href",
  });
  return String(result.result?.value || "");
}

function shouldNavigateForCapture(currentUrl, targetUrl) {
  if (!currentUrl || currentUrl.startsWith("about:blank")) return true;
  if (!currentUrl.includes("douyin.com")) return true;
  return !isLikelyTargetPage(currentUrl, targetUrl);
}

function createCdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);

    if (message.error) {
      request.reject(new Error(message.error.message || "CDP command failed"));
    } else {
      request.resolve(message.result || {});
    }
  });

  return {
    async call(method, params = {}) {
      await waitForWebSocketOpen(ws);
      const messageId = ++id;
      ws.send(JSON.stringify({ id: messageId, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(messageId, { resolve, reject });
        setTimeout(() => {
          if (pending.has(messageId)) {
            pending.delete(messageId);
            reject(new Error(`CDP command timeout: ${method}`));
          }
        }, 20_000);
      });
    },
    async close() {
      try {
        ws.close();
      } catch {
        // Ignore close errors.
      }
    },
  };
}

function waitForWebSocketOpen(ws) {
  if (ws.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }
  if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
    return Promise.reject(new Error("CDP WebSocket is closed"));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CDP WebSocket open timeout")), 10_000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("CDP WebSocket error"));
    }, { once: true });
  });
}

async function waitForPageSettled(page) {
  try {
    await page.call("Runtime.evaluate", {
      expression: "new Promise(resolve => window.requestAnimationFrame(() => setTimeout(resolve, 800)))",
      awaitPromise: true,
    });
  } catch {
    await delay(1000);
  }
}

async function scrollDouyinSearchResults(page) {
  const rounds = Math.max(1, Math.min(8, Number(process.env.DOUYIN_DISCOVERY_SCROLL_ROUNDS || 3)));
  for (let index = 0; index < rounds; index += 1) {
    await page.call("Runtime.evaluate", {
      awaitPromise: true,
      expression: "new Promise(resolve => { window.scrollBy(0, Math.max(700, window.innerHeight * 0.85)); setTimeout(resolve, 900); })",
    }).catch(() => undefined);
  }
}

async function collectDouyinVideoLinks(page, limit = 16) {
  const result = await page.call("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(() => {
      const seen = new Set();
      const items = [];
      const addUrl = (rawUrl, title = '') => {
        if (!rawUrl) return;
        let url = rawUrl;
        try {
          url = new URL(rawUrl, location.href).toString();
        } catch {
          return;
        }
        const match = url.match(/douyin\\.com\\/(?:video|note)\\/\\d+/) || url.match(/[?&]modal_id=(\\d+)/);
        if (!match) return;
        const id = match[1] || (url.match(/\\/(\\d+)(?:[/?#]|$)/) || [])[1] || '';
        if (!id || seen.has(id)) return;
        seen.add(id);
        items.push({
          id,
          url: 'https://www.douyin.com/video/' + id,
          title: String(title || document.title || '').slice(0, 160)
        });
      };
      for (const node of document.querySelectorAll('a[href]')) {
        addUrl(node.href, node.innerText || node.getAttribute('aria-label') || '');
      }
      const text = document.body ? document.body.innerHTML : '';
      for (const match of text.matchAll(/(?:video|note)\\/(\\d{12,25})/g)) {
        addUrl('https://www.douyin.com/video/' + match[1], '');
      }
      for (const match of text.matchAll(/modal_id=(\\d{12,25})/g)) {
        addUrl('https://www.douyin.com/video/' + match[1], '');
      }
      return items.slice(0, ${Number(limit) || 16});
    })()`,
  });
  return Array.isArray(result.result?.value) ? result.result.value : [];
}

async function evaluatePageSnapshot(page) {
  const result = await page.call("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(() => {
      const selectors = 'h1,h2,h3,p,a,[data-e2e*="video"],[class*="title"],[class*="desc"]';
      const text = Array.from(document.querySelectorAll(selectors))
        .map(node => (node.innerText || node.textContent || '').trim())
        .filter(Boolean)
        .filter((value, index, arr) => value.length > 1 && arr.indexOf(value) === index)
        .slice(0, 40)
        .join('\\n');
      const metas = Array.from(document.querySelectorAll('meta'))
        .map(meta => ({
          name: meta.getAttribute('name') || meta.getAttribute('property') || '',
          content: meta.getAttribute('content') || ''
        }))
        .filter(item => item.content);
      const videos = Array.from(document.querySelectorAll('video'))
        .map(video => video.currentSrc || video.src || video.querySelector('source')?.src || '')
        .filter(Boolean);
      return {
        finalUrl: location.href,
        title: document.title || '',
        description: document.querySelector('meta[name="description"]')?.content || '',
        text,
        metas,
        videoUrl: videos[0] || '',
        videoCount: videos.length
      };
    })()`,
  });

  return result.result?.value || {};
}

async function captureScreenshotDataUrl(page, clip = null) {
  const params = {
    format: "jpeg",
    quality: Number(process.env.BROWSER_FRAME_JPEG_QUALITY || 52),
    captureBeyondViewport: false,
  };
  if (clip) {
    params.clip = fitScreenshotClip(clip);
  }

  const result = await page.call("Page.captureScreenshot", params);

  return result.data ? `data:image/jpeg;base64,${result.data}` : "";
}

function fitScreenshotClip(clip) {
  const maxSide = Math.max(320, Number(process.env.BROWSER_FRAME_MAX_SIDE || 720));
  const width = Math.max(1, Number(clip.width || 1));
  const height = Math.max(1, Number(clip.height || 1));
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    x: Math.round(Number(clip.x || 0)),
    y: Math.round(Number(clip.y || 0)),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    scale,
  };
}

async function prepareVideoPlayback(page) {
  await page.call("Runtime.evaluate", {
    expression: `(() => {
      const video = document.querySelector('video');
      if (video) {
        video.currentTime = Math.max(0, video.currentTime || 0);
        if (video.paused) video.muted = true;
        video.play().catch(() => undefined);
        return true;
      }
      const buttons = Array.from(document.querySelectorAll('button, [role="button"], div, span'));
      const playButton = buttons.find(node => /播放|play/i.test(node.innerText || node.getAttribute?.('aria-label') || ''));
      playButton?.click?.();
      return Boolean(playButton);
    })()`,
  });
}

async function captureVideoAudio(page, options = {}) {
  const durationMs = Math.max(3000, Math.min(30000, options.durationMs || 12000));
  const result = await page.call("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `new Promise((resolve) => {
      const video = document.querySelector('video');
      if (!video) {
        resolve({ status: 'no-video', error: 'No video element found.' });
        return;
      }
      const canCapture = typeof video.captureStream === 'function' || typeof video.mozCaptureStream === 'function';
      if (!canCapture || typeof MediaRecorder === 'undefined') {
        resolve({ status: 'unsupported', error: 'Browser does not support video captureStream/MediaRecorder.' });
        return;
      }
      let stream;
      try {
        stream = (video.captureStream || video.mozCaptureStream).call(video);
      } catch (error) {
        resolve({ status: 'failed', error: error.message || String(error) });
        return;
      }
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) {
        resolve({ status: 'no-audio-track', error: 'Video stream has no audio track.' });
        return;
      }
      const audioOnly = new MediaStream(audioTracks);
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const chunks = [];
      let recorder;
      try {
        recorder = new MediaRecorder(audioOnly, mimeType ? { mimeType } : undefined);
      } catch (error) {
        resolve({ status: 'failed', error: error.message || String(error) });
        return;
      }
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) chunks.push(event.data);
      };
      recorder.onerror = (event) => {
        resolve({ status: 'failed', error: event.error?.message || 'MediaRecorder error.' });
      };
      recorder.onstop = async () => {
        try {
          audioOnly.getTracks().forEach((track) => track.stop());
          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
          if (!blob.size) {
            resolve({ status: 'empty', error: 'Recorded audio is empty.' });
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              status: 'captured',
              mimeType: blob.type || 'audio/webm',
              dataUrl: reader.result,
              byteLength: blob.size,
            });
          };
          reader.onerror = () => resolve({ status: 'failed', error: 'Failed to read recorded audio.' });
          reader.readAsDataURL(blob);
        } catch (error) {
          resolve({ status: 'failed', error: error.message || String(error) });
        }
      };
      try {
        video.play().catch(() => undefined);
        recorder.start();
        setTimeout(() => {
          if (recorder.state !== 'inactive') recorder.stop();
        }, ${durationMs});
      } catch (error) {
        resolve({ status: 'failed', error: error.message || String(error) });
      }
    })`,
  });

  const value = result.result?.value || {};
  return {
    status: value.status || "failed",
    mimeType: value.mimeType || "",
    dataUrl: value.dataUrl || "",
    byteLength: Number(value.byteLength || 0),
    error: value.error || "",
  };
}

async function transcribeCapturedAudio(audioCapture) {
  if (audioCapture.status !== "captured" || !audioCapture.dataUrl) {
    return {
      transcript: "",
      status: audioCapture.status || "skipped",
      error: audioCapture.error || "",
    };
  }

  const audioBuffer = dataUrlToBuffer(audioCapture.dataUrl);
  if (!audioBuffer.length) {
    return { transcript: "", status: "empty", error: "Recorded audio is empty." };
  }

  const provider = String(process.env.ASR_PROVIDER || "").trim().toLowerCase();
  if (provider === "qwen3-asr-flash" || provider === "dashscope-qwen3-asr") {
    return transcribeWithQwenAsr(audioCapture);
  }

  const baseUrl = (process.env.ASR_BASE_URL || process.env.MODEL_BASE_URL || "").replace(/\/+$/, "");
  const apiKey = process.env.ASR_API_KEY || process.env.MODEL_API_KEY;
  if (!baseUrl || !apiKey) {
    return { transcript: "", status: "unconfigured", error: "ASR endpoint is not configured." };
  }

  const endpoint = process.env.ASR_TRANSCRIPT_PATH || "/v1/audio/transcriptions";
  const url = `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const ext = mimeTypeToAudioExtension(audioCapture.mimeType);
  const form = new FormData();
  form.set("model", process.env.ASR_MODEL_NAME || "whisper-1");
  form.set("file", new Blob([audioBuffer], { type: audioCapture.mimeType || "audio/webm" }), `capture.${ext}`);
  form.set("response_format", "json");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text();
    return {
      transcript: "",
      status: "failed",
      error: `ASR error ${response.status}: ${detail.slice(0, 300)}`,
    };
  }

  const payload = await response.json();
  return {
    transcript: String(payload.text || payload.transcript || payload.data?.text || "").trim(),
    status: "transcribed",
    error: "",
  };
}

async function transcribeWithQwenAsr(audioCapture) {
  const dataUrl = normalizeAudioDataUrl(audioCapture.dataUrl, audioCapture.mimeType);
  const sizeBytes = dataUrlToBuffer(dataUrl).length;
  const maxBytes = Number(process.env.QWEN_ASR_MAX_AUDIO_BYTES || 7 * 1024 * 1024);
  if (sizeBytes > maxBytes) {
    return {
      transcript: "",
      status: "too-large",
      error: `Qwen ASR audio is too large after capture: ${formatBytes(sizeBytes)}.`,
    };
  }

  const apiKey = String(process.env.DASHSCOPE_API_KEY || process.env.ASR_API_KEY || "").trim();
  if (!apiKey) {
    return { transcript: "", status: "unconfigured", error: "DASHSCOPE_API_KEY is required for qwen3-asr-flash." };
  }
  const baseUrl = String(process.env.DASHSCOPE_COMPATIBLE_BASE_URL || `${(process.env.DASHSCOPE_API_BASE_URL || "https://dashscope.aliyuncs.com").replace(/\/+$/, "")}/compatible-mode/v1`).replace(/\/+$/, "");
  const model = String(process.env.ASR_MODEL_NAME || "qwen3-asr-flash").trim();

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: {
                data: dataUrl,
              },
            },
          ],
        },
      ],
      stream: false,
      asr_options: {
        enable_itn: false,
      },
    }),
  });

  const payloadText = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(payloadText);
  } catch {
    payload = { raw: payloadText };
  }
  if (!response.ok) {
    return {
      transcript: "",
      status: "failed",
      error: `Qwen ASR error ${response.status}: ${JSON.stringify(payload).slice(0, 400)}`,
    };
  }
  const content = payload.choices?.[0]?.message?.content;
  const transcript = typeof content === "string"
    ? content.trim()
    : Array.isArray(content)
      ? content.map((item) => item.text || "").join("").trim()
      : "";
  return {
    transcript,
    status: transcript ? "transcribed" : "empty",
    error: transcript ? "" : `Qwen ASR returned no text: ${JSON.stringify(payload).slice(0, 300)}`,
    model,
  };
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/);
  if (!match) return Buffer.alloc(0);
  return Buffer.from(match[2], "base64");
}

function normalizeAudioDataUrl(dataUrl, fallbackMimeType = "audio/webm") {
  const raw = String(dataUrl || "");
  const match = raw.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/);
  if (match) {
    return `data:${match[1] || cleanAudioMimeType(fallbackMimeType)};base64,${match[2]}`;
  }
  const buffer = dataUrlToBuffer(raw);
  const mimeType = cleanAudioMimeType(fallbackMimeType);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function cleanAudioMimeType(value = "audio/webm") {
  return String(value || "audio/webm").split(";")[0].trim() || "audio/webm";
}

function mimeTypeToAudioExtension(mimeType = "") {
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4") || mimeType.includes("aac")) return "m4a";
  return "webm";
}

async function getVideoCaptureTarget(page) {
  const result = await page.call("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
      const videos = Array.from(document.querySelectorAll('video'))
        .map((video) => {
          const rect = video.getBoundingClientRect();
          const width = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
          const height = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
          const area = width * height;
          const src = video.currentSrc || video.src || video.querySelector('source')?.src || '';
          return {
            src,
            paused: video.paused,
            readyState: video.readyState,
            duration: Number.isFinite(video.duration) ? video.duration : 0,
            currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
            width,
            height,
            area,
            clip: {
              x: Math.max(0, rect.left),
              y: Math.max(0, rect.top),
              width,
              height,
              scale: 1,
            },
          };
        })
        .filter((item) => item.area > 40000 && item.width >= 180 && item.height >= 180)
        .sort((a, b) => b.area - a.area);
      return videos[0] || null;
    })()`,
  });

  const target = result.result?.value || null;
  if (!target?.clip) return null;
  const clip = target.clip;
  if (!clip.width || !clip.height) return null;

  return {
    src: target.src || "",
    paused: Boolean(target.paused),
    readyState: Number(target.readyState || 0),
    duration: Number(target.duration || 0),
    currentTime: Number(target.currentTime || 0),
    clip: {
      x: Math.round(clip.x),
      y: Math.round(clip.y),
      width: Math.round(clip.width),
      height: Math.round(clip.height),
      scale: 1,
    },
  };
}

async function captureVideoFrames(page, options) {
  const frames = [];
  const count = Math.max(1, Math.min(8, options.count || 5));
  const intervalMs = Math.max(500, Math.min(5000, options.intervalMs || 1600));
  const durationSeconds = Number(options.durationSeconds || 0);
  const useSeekSampling = parseBoolean(process.env.BROWSER_SEEK_FRAME_SAMPLING ?? true, true)
    && Number.isFinite(durationSeconds)
    && durationSeconds >= 18;

  for (let index = 0; index < count; index += 1) {
    if (useSeekSampling) {
      const targetTime = Math.max(0.25, Math.min(durationSeconds - 0.25, durationSeconds * ((index + 1) / (count + 1))));
      await seekActiveVideo(page, targetTime).catch(() => delay(250));
    } else if (index > 0) {
      await delay(intervalMs);
    }
    const frame = await captureScreenshotDataUrl(page, options.clip || null);
    if (frame && !frames.includes(frame)) {
      frames.push(frame);
    }
  }

  return frames;
}

async function seekActiveVideo(page, timeSeconds) {
  await page.call("Runtime.evaluate", {
    awaitPromise: true,
    expression: `(() => new Promise((resolve) => {
      const videos = Array.from(document.querySelectorAll('video'))
        .map((video) => {
          const rect = video.getBoundingClientRect();
          return { video, area: Math.max(0, rect.width) * Math.max(0, rect.height) };
        })
        .sort((a, b) => b.area - a.area);
      const video = videos[0]?.video;
      if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
        resolve(false);
        return;
      }
      const target = Math.max(0, Math.min(Number(video.duration) - 0.2, ${Number(timeSeconds) || 0}));
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        video.removeEventListener('seeked', onSeeked);
        resolve(ok);
      };
      const onSeeked = () => setTimeout(() => finish(true), 120);
      video.addEventListener('seeked', onSeeked, { once: true });
      try {
        video.pause();
        video.currentTime = target;
      } catch {
        finish(false);
      }
      setTimeout(() => finish(true), 1200);
    }))()`,
  });
}

function compactCaptureText(snapshot) {
  const metaText = (snapshot.metas || [])
    .filter((item) => /title|description|keywords|name|og:/i.test(item.name))
    .map((item) => `${item.name}: ${item.content}`)
    .join("\n");

  return [
    snapshot.title ? `页面标题：${snapshot.title}` : "",
    snapshot.description ? `页面描述：${snapshot.description}` : "",
    metaText,
    snapshot.text ? `页面可见文本：\n${snapshot.text}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 6000);
}

function isCaptureUsable(capture) {
  const videoUrl = String(capture.videoUrl || "").trim();
  const screenshot = String(capture.screenshotDataUrl || "");
  const frames = Array.isArray(capture.frameDataUrls) ? capture.frameDataUrls : [];
  const target = capture.videoTarget || null;
  const clip = target?.clip || null;
  const isPlaceholderVideo = /douyin-pc-web\/uuu_|placeholder|loading/i.test(videoUrl);
  const hasVideoElement = Boolean(clip && clip.width >= 180 && clip.height >= 180);
  const hasLoadedVideo = Number(target?.readyState || 0) >= 2 ||
    Number(target?.duration || 0) > 0 ||
    Number(target?.currentTime || 0) > 0.2;
  const hasVideoUrl = !isPlaceholderVideo && (/^https?:\/\//.test(videoUrl) || videoUrl.startsWith("blob:"));
  const hasFrameSequence = frames.length >= 2 && frames.some((frame) => frame.length > 35_000);
  const hasNonTinyScreenshot = screenshot.length > 45_000;

  return hasVideoElement && hasLoadedVideo && (hasVideoUrl || hasFrameSequence || hasNonTinyScreenshot);
}

function getCaptureBlockedReason(capture) {
  const title = String(capture.title || "");
  const debugText = String(capture.debugText || "");
  const pageText = `${title}\n${debugText}`;
  const target = capture.videoTarget || null;

  if (/验证码|验证|captcha/i.test(pageText)) {
    return "抖音验证码中间页拦截，未进入真实视频页。请先在打开的登录浏览器里完成验证，再重新采集。";
  }
  if (/登录|扫码登录|密码登录|手机号登录/i.test(pageText) && !target) {
    return "抖音登录页拦截，未进入真实视频页。请先在打开的登录浏览器里完成登录，再重新采集。";
  }
  if (!target) {
    return "未识别到真实视频播放器。请确认粘贴的是抖音复制口令/短链/视频页，并且登录态浏览器能正常打开该视频。";
  }
  if (Number(target.readyState || 0) < 2 && Number(target.duration || 0) <= 0 && Number(target.currentTime || 0) <= 0.2) {
    return "已找到视频区域，但原视频尚未加载或未播放。请在登录态浏览器里播放该视频后重新采集。";
  }
  return "";
}

function parseJsonObject(text, fallbackFactory) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // Fall through.
      }
    }
  }

  return fallbackFactory();
}

function ensureModelConfigured() {
  if (!getModelBaseUrl() || !getModelApiKey()) {
    throwHttp(503, "Model API is not configured. Set MODEL_BASE_URL and MODEL_API_KEY or DASHSCOPE_API_KEY.");
  }
}

function getModelBaseUrl() {
  const explicit = String(process.env.MODEL_BASE_URL || "").trim();
  if (explicit) return explicit;
  const dashscopeBase = String(process.env.DASHSCOPE_API_BASE_URL || "https://dashscope.aliyuncs.com").replace(/\/+$/, "");
  return `${dashscopeBase}/compatible-mode/v1`;
}

function getModelApiKey() {
  return String(process.env.MODEL_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.ALIYUN_API_KEY || "").trim();
}

function getWanDurationSeconds(value) {
  const raw = value ?? process.env.WAN_I2V_DURATION_SECONDS ?? process.env.WAN_DURATION_SECONDS ?? 10;
  const duration = Math.round(Number(raw));
  if (!Number.isFinite(duration)) return 10;
  return Math.min(15, Math.max(2, duration));
}

function buildWanDurationPlan(input = {}) {
  const sourceDurationSeconds = pickPositiveNumber([
    input.sourceDurationSeconds,
    input.originalDurationSeconds,
    input.extraction?.sourceDurationSeconds,
    input.extraction?.capture?.videoTarget?.duration,
    input.extraction?.capture?.durationSeconds,
    input.extraction?.capture?.duration,
    input.capture?.videoTarget?.duration,
    input.capture?.durationSeconds,
    input.capture?.duration,
  ]);
  const explicitDurationSeconds = pickPositiveNumber([input.durationSeconds, input.duration]);
  const manualDurationOverride = parseBoolean(input.manualDurationOverride ?? input.durationOverride, false);
  const fallbackDurationSeconds = getWanDurationSeconds();
  const selectedDurationSeconds = manualDurationOverride && explicitDurationSeconds
    ? explicitDurationSeconds
    : sourceDurationSeconds || explicitDurationSeconds || fallbackDurationSeconds;
  const requestedDurationSeconds = selectedDurationSeconds;
  const outputDurationSeconds = getWanDurationSeconds(selectedDurationSeconds);
  const maxSingleSegmentSeconds = 15;
  const minSingleSegmentSeconds = 2;
  return {
    sourceDurationSeconds: sourceDurationSeconds || null,
    explicitDurationSeconds: explicitDurationSeconds || null,
    manualDurationOverride,
    requestedDurationSeconds,
    outputDurationSeconds,
    minSingleSegmentSeconds,
    maxSingleSegmentSeconds,
    followsSourceDuration: Boolean(sourceDurationSeconds && Math.abs(sourceDurationSeconds - outputDurationSeconds) <= 0.75),
    needsSegmentation: Boolean(sourceDurationSeconds && sourceDurationSeconds > maxSingleSegmentSeconds),
    estimatedSegments: sourceDurationSeconds ? Math.max(1, Math.ceil(sourceDurationSeconds / maxSingleSegmentSeconds)) : 1,
    reason: manualDurationOverride && explicitDurationSeconds
      ? "使用手动指定时长；如需复刻原片节奏，请关闭 duration override。"
      : sourceDurationSeconds
      ? sourceDurationSeconds > maxSingleSegmentSeconds
        ? "原视频超过 wan2.7-i2v 单段 15 秒上限，本次先生成首段，后续需要分段生成并拼接。"
        : "输出时长跟随原视频时长，并按 wan2.7-i2v 支持的 2-15 秒整数约束取整。"
      : "未获取到原视频时长，使用默认单段时长。",
  };
}

function pickPositiveNumber(values = []) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(text)) return true;
  if (["0", "false", "no", "n", "off"].includes(text)) return false;
  return fallback;
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throwHttp(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const safePath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(rootDir, safePath));

  if (!filePath.startsWith(rootDir)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }
  if (!isPublicStaticPath(safePath, filePath)) {
    return sendJson(res, 404, { error: "Not found" });
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      return sendJson(res, 404, { error: "Not found" });
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

function isPublicStaticPath(urlPath, filePath) {
  const normalizedUrl = urlPath.replace(/\\/g, "/");
  const normalizedFile = filePath.replace(/\\/g, "/");
  const publicRootFiles = new Set(["/index.html", "/styles.css", "/app.js", "/README.md"]);
  if (publicRootFiles.has(normalizedUrl)) return true;
  const allowedAssetDirs = [
    path.join(rootDir, "assets", "uploads").replace(/\\/g, "/"),
    path.join(rootDir, "assets", "outputs").replace(/\\/g, "/"),
  ];
  return allowedAssetDirs.some((dir) => normalizedFile.startsWith(`${dir}/`));
}

function readRawBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        reject(Object.assign(new Error(`Request body too large, limit ${formatBytes(limitBytes)}`), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipartFormData(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];
  if (!boundary) {
    throwHttp(400, "multipart/form-data 缺少 boundary。");
  }

  const delimiter = Buffer.from(`--${boundary}`);
  const fields = {};
  const files = {};
  let offset = 0;

  while (offset < buffer.length) {
    const partStart = buffer.indexOf(delimiter, offset);
    if (partStart === -1) break;
    let cursor = partStart + delimiter.length;
    if (buffer.slice(cursor, cursor + 2).toString() === "--") break;
    if (buffer.slice(cursor, cursor + 2).toString() === "\r\n") cursor += 2;

    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), cursor);
    if (headerEnd === -1) break;
    const headerText = buffer.slice(cursor, headerEnd).toString("utf8");
    const nextBoundary = buffer.indexOf(delimiter, headerEnd + 4);
    if (nextBoundary === -1) break;

    let dataEnd = nextBoundary;
    if (buffer.slice(dataEnd - 2, dataEnd).toString() === "\r\n") dataEnd -= 2;
    const data = buffer.slice(headerEnd + 4, dataEnd);
    const disposition = headerText.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] || "";
    const name = disposition.match(/name="([^"]+)"/i)?.[1];
    if (!name) {
      offset = nextBoundary;
      continue;
    }
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1];
    const contentTypeMatch = headerText.match(/content-type:\s*([^\r\n]+)/i);
    if (filename !== undefined) {
      files[name] = {
        filename,
        contentType: contentTypeMatch?.[1]?.trim() || "application/octet-stream",
        data,
      };
    } else {
      fields[name] = data.toString("utf8");
    }
    offset = nextBoundary;
  }

  return { fields, files };
}

function normalizeAssetKind(value = "") {
  const normalized = String(value).trim().toLowerCase();
  if (["voice", "audio", "sound"].includes(normalized)) return "voice";
  if (["video", "avatar", "person"].includes(normalized)) return "video";
  if (["history", "sample", "reference"].includes(normalized)) return "history";
  return "";
}

function validateAssetFile(kind, file) {
  const ext = path.extname(file.filename || "").toLowerCase();
  const type = (file.contentType || "").toLowerCase();
  const isAudio = type.startsWith("audio/") || [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".webm"].includes(ext);
  const isVideo = type.startsWith("video/") || [".mp4", ".mov", ".m4v", ".webm"].includes(ext);
  const isImage = type.startsWith("image/") || [".jpg", ".jpeg", ".png", ".bmp", ".webp"].includes(ext);

  if (kind === "voice" && !isAudio) {
    throwHttp(415, "声音样本只接受音频文件。");
  }
  if (kind === "video" && !isVideo && !isImage) {
    throwHttp(415, "真人形象只接受图片或视频文件；wan2.2-s2v 优先使用单张真人图片。");
  }
  if (kind === "history" && !isAudio && !isVideo && !isImage) {
    throwHttp(415, "历史作品只接受音频、图片或视频文件。");
  }
}

function getSafeAssetExtension(filename, contentType = "") {
  const ext = path.extname(filename || "").toLowerCase();
  const allowed = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".webm", ".mp4", ".mov", ".m4v", ".jpg", ".jpeg", ".png", ".bmp", ".webp"]);
  if (allowed.has(ext)) return ext;
  if (contentType.startsWith("audio/mpeg")) return ".mp3";
  if (contentType.startsWith("audio/wav")) return ".wav";
  if (contentType.startsWith("audio/mp4")) return ".m4a";
  if (contentType.startsWith("video/mp4")) return ".mp4";
  if (contentType.startsWith("video/quicktime")) return ".mov";
  if (contentType.startsWith("video/webm") || contentType.startsWith("audio/webm")) return ".webm";
  if (contentType.startsWith("image/jpeg")) return ".jpg";
  if (contentType.startsWith("image/png")) return ".png";
  if (contentType.startsWith("image/bmp")) return ".bmp";
  if (contentType.startsWith("image/webp")) return ".webp";
  return ".bin";
}

function sanitizeFilename(filename) {
  const fallback = "asset";
  const base = path.basename(filename || fallback).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  return base || fallback;
}

function getUploadLimitBytes() {
  const mb = Number(process.env.ASSET_UPLOAD_LIMIT_MB || 250);
  return Math.max(5, Math.min(mb, 2048)) * 1024 * 1024;
}

function appendAssetManifest(asset) {
  fs.mkdirSync(uploadDir, { recursive: true });
  let manifest = [];
  if (fs.existsSync(assetManifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(assetManifestPath, "utf8"));
    } catch {
      manifest = [];
    }
  }
  manifest.unshift(asset);
  fs.writeFileSync(assetManifestPath, JSON.stringify(manifest.slice(0, 200), null, 2), "utf8");
}

function formatBytes(size) {
  if (!Number.isFinite(size)) return "--";
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  if (size >= 1024) return `${Math.round(size / 1024)}KB`;
  return `${size}B`;
}

function getJsonLimitBytes(pathname = "") {
  const defaultMb = Number(process.env.JSON_BODY_LIMIT_MB || 2);
  const captureMb = Number(process.env.CAPTURE_JSON_BODY_LIMIT_MB || 12);
  const rewriteMb = Number(process.env.REWRITE_JSON_BODY_LIMIT_MB || 4);
  const mb = pathname === "/api/video/extract" || pathname === "/api/video/capture-extract"
    ? captureMb
    : pathname === "/api/script/rewrite"
      ? rewriteMb
      : defaultMb;
  return Math.max(1, Math.min(mb, 64)) * 1024 * 1024;
}

function readJson(req, limitBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > limitBytes) {
        reject(Object.assign(new Error(`请求体过大：${formatBytes(raw.length)}，当前接口限制 ${formatBytes(limitBytes)}。请不要把抽帧 base64 传给后续生成接口。`), { statusCode: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        const normalized = raw.replace(/^\uFEFF/, "");
        resolve(normalized ? JSON.parse(normalized) : {});
      } catch {
        reject(Object.assign(new Error("Invalid JSON body"), { statusCode: 400 }));
      }
    });
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
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
