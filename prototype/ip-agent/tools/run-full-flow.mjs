import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.IP_AGENT_BASE_URL || "http://127.0.0.1:8765";
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");

const args = parseArgs(process.argv.slice(2));
const industry = args.industry ? String(args.industry) : "";
const persona = args.persona ? String(args.persona) : "";
const offer = args.offer ? String(args.offer) : "";
const explicitDurationSeconds = args.duration ? clampInt(args.duration, 2, 15, 10) : null;
const outputPrefix = args.prefix || `test-full-${stamp}`;

const state = {};

main().catch((error) => {
  state.error = {
    message: error.message || String(error),
    payload: error.payload || null,
    stack: error.stack || "",
  };
  writeJson(`${outputPrefix}-error.json`, state.error);
  writeReport(state);
  console.error(`failed=${state.error.message}`);
  console.error(`report=${path.join(rootDir, `${outputPrefix}-report.md`)}`);
  process.exitCode = 1;
});

async function main() {
  state.discovery = await resolveTestInputUrl();
  const inputUrl = state.discovery.url;
  const common = compactObject({
    url: inputUrl,
    industry,
    persona,
    offer,
    mode: "auto",
  });

try {
  console.log(`[1/5] capture-extract ${inputUrl}`);
  state.extraction = await postJson("/api/video/capture-extract", {
    ...common,
    frameCount: clampInt(args.frames || 8, 1, 12, 8),
    frameIntervalMs: clampInt(args.frameIntervalMs || 5500, 500, 10000, 5500),
    audioDurationMs: clampInt(args.audioDurationMs || 60000, 3000, 60000, 60000),
  }, 260_000);
  writeJson(`${outputPrefix}-capture-extract.json`, state.extraction);
  state.sourceDurationSeconds = getSourceDurationSeconds(state.extraction);
  state.durationSeconds = explicitDurationSeconds || getSingleSegmentDurationSeconds(state.sourceDurationSeconds);
  console.log(`  source=${state.extraction.source} frames=${state.extraction.capture?.frameCount || 0} asr=${state.extraction.capture?.audio?.status || ""} sourceDuration=${formatDuration(state.sourceDurationSeconds)}`);

  console.log("[2/5] rewrite");
  state.generated = await postJson("/api/script/rewrite", {
    ...common,
    extraction: compactExtraction(state.extraction),
  }, 220_000);
  writeJson(`${outputPrefix}-rewrite.json`, state.generated);
  console.log(`  source=${state.generated.source} title=${state.generated.title}`);

  console.log("[3/5] qwen-tts");
  state.audio = await postJson("/api/audio/synthesize", {
    ...common,
    extraction: compactExtraction(state.extraction),
    generated: state.generated,
    script: state.generated.script,
  }, 180_000);
  writeJson(`${outputPrefix}-tts.json`, state.audio);
  console.log(`  audio=${state.audio.id} ${state.audio.sizeLabel || ""}`);

  console.log(args.avatar ? "[4/5] upload custom avatar asset" : "[4/5] load standard/avatar assets");
  const image = args.avatar ? await uploadLocalAsset("video", args.avatar) : await loadStandardAvatarAsset();
  if (!image?.path) {
    throw new Error("No avatar image asset returned.");
  }
  state.avatar = image;

  console.log(`[5/5] wan2.7-i2v duration=${state.durationSeconds}s${explicitDurationSeconds ? " (manual override)" : " (source-following)"}`);
  state.video = await postJson("/api/video/avatar-render", {
    ...common,
    extraction: compactExtraction(state.extraction),
    generated: state.generated,
    audio: state.audio,
    assets: { video: image },
    script: state.generated.script,
    sourceDurationSeconds: state.sourceDurationSeconds || undefined,
    durationSeconds: state.durationSeconds,
    manualDurationOverride: Boolean(explicitDurationSeconds),
    pollTimeoutMs: clampInt(args.pollTimeoutMs || 900000, 0, 1800000, 900000),
  }, 1_200_000);
  writeJson(`${outputPrefix}-wan-result.json`, state.video);
  console.log(`  status=${state.video.status} taskId=${state.video.taskId}`);

  if (state.video.videoUrl || state.video.url) {
    state.localVideo = path.join(rootDir, "assets", "outputs", `${outputPrefix}-wan2.7-i2v.mp4`);
    await downloadFile(state.video.videoUrl || state.video.url, state.localVideo);
    console.log(`  downloaded=${state.localVideo}`);
  }

  state.mp4Info = state.localVideo ? readMp4Info(state.localVideo) : null;
  writeReport(state);
  console.log(`report=${path.join(rootDir, `${outputPrefix}-report.md`)}`);
} catch (error) {
  throw error;
}
}

function writeReport(current) {
  const report = buildReport({
    inputUrl: current.discovery?.url || args.url || "",
    discovery: current.discovery || null,
    industry,
    persona,
    offer,
    sourceDurationSeconds: current.sourceDurationSeconds || 0,
    durationSeconds: current.durationSeconds || explicitDurationSeconds || 0,
    outputPrefix,
    extraction: current.extraction,
    generated: current.generated,
    audio: current.audio,
    video: current.video,
    avatar: current.avatar || null,
    localVideo: current.localVideo || "",
    mp4Info: current.mp4Info || null,
    error: current.error || null,
  });
  fs.writeFileSync(path.join(rootDir, `${outputPrefix}-report.md`), report, "utf8");
}

function parseArgs(items) {
  const result = {};
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = items[index + 1];
    if (next && !next.startsWith("--")) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

async function resolveTestInputUrl() {
  if (args.url) {
    return {
      source: "manual",
      url: String(args.url),
      keyword: "",
      title: "",
    };
  }

  const keyword = String(args.keyword || process.env.DOUYIN_TEST_KEYWORD || industry || "热门");
  console.log(`[0/5] discover fresh douyin video keyword=${keyword}`);
  const discovered = await postJson("/api/video/discover", {
    keyword,
    limit: clampInt(args.discoveryLimit || 18, 3, 30, 18),
    maxDurationSeconds: clampInt(args.maxSourceSeconds || 60, 5, 600, 60),
  }, 90_000);
  const selected = discovered.selected || {};
  if (!selected.url) {
    throw new Error(`No fresh Douyin video discovered for keyword: ${keyword}`);
  }
  console.log(`  selected=${selected.url} title=${selected.title || ""}`);
  writeJson(`${outputPrefix}-discovery.json`, discovered);
  return {
    source: "auto-discovery",
    url: selected.url,
    keyword,
    title: selected.title || "",
    discoveredAt: selected.discoveredAt || "",
  };
}

async function postJson(endpoint, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const error = new Error(payload.error || `HTTP ${response.status}`);
      error.payload = payload;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function uploadLocalAsset(kind, filePath) {
  const absolutePath = path.resolve(String(filePath));
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Avatar asset not found: ${absolutePath}`);
  }
  const buffer = fs.readFileSync(absolutePath);
  const form = new FormData();
  form.set("kind", kind);
  form.set("file", new Blob([buffer], { type: getContentType(absolutePath) }), path.basename(absolutePath));
  const response = await fetch(`${baseUrl}/api/assets/upload`, {
    method: "POST",
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Asset upload failed HTTP ${response.status}`);
  }
  console.log(`  avatar=${payload.asset.name} ${payload.asset.sizeLabel || ""}`);
  return payload.asset;
}

async function loadStandardAvatarAsset() {
  const standardResult = await postJson("/api/assets/standard/install", {}, 180_000);
  const assets = standardResult.assets || standardResult;
  return assets.video;
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if ([".jpg", ".jpeg"].includes(ext)) return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  return "application/octet-stream";
}

function writeJson(name, value) {
  fs.writeFileSync(path.join(rootDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function compactObject(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function compactExtraction(extraction) {
  const clone = JSON.parse(JSON.stringify(extraction || {}));
  delete clone.capture?.frameDataUrls;
  delete clone.capture?.screenshotDataUrl;
  delete clone.frameDataUrls;
  delete clone.screenshotDataUrl;
  return clone;
}

function getSourceDurationSeconds(extraction) {
  const capture = extraction?.capture || null;
  const candidates = [
    capture?.videoTarget?.duration,
    capture?.durationSeconds,
    capture?.duration,
    extraction?.sourceDurationSeconds,
  ];
  for (const value of candidates) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}

function getSingleSegmentDurationSeconds(sourceDurationSeconds) {
  const sourceDuration = Number(sourceDurationSeconds);
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) {
    return clampInt(process.env.WAN_I2V_DURATION_SECONDS || 10, 2, 15, 10);
  }
  return Math.min(15, Math.max(2, Math.round(sourceDuration)));
}

function formatDuration(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "unknown";
  return `${seconds.toFixed(seconds >= 10 ? 1 : 2)}s`;
}

async function downloadFile(url, filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`);
  fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
}

function readMp4Info(filePath) {
  const buf = fs.readFileSync(filePath);
  function findBox(type, start = 0, end = buf.length) {
    for (let i = start; i + 8 <= end;) {
      const size = buf.readUInt32BE(i);
      const name = buf.toString("ascii", i + 4, i + 8);
      if (name === type) return { start: i, size, end: i + size };
      if (!size) break;
      i += size;
    }
    return null;
  }
  const moov = findBox("moov");
  const mvhd = moov ? findBox("mvhd", moov.start + 8, moov.end) : null;
  let durationSeconds = null;
  let timescale = null;
  if (mvhd) {
    const version = buf[mvhd.start + 8];
    const off = mvhd.start + 12;
    if (version === 0) {
      timescale = buf.readUInt32BE(off + 8);
      durationSeconds = timescale ? buf.readUInt32BE(off + 12) / timescale : null;
    } else if (version === 1) {
      timescale = buf.readUInt32BE(off + 16);
      durationSeconds = timescale
        ? ((buf.readUInt32BE(off + 20) * 2 ** 32) + buf.readUInt32BE(off + 24)) / timescale
        : null;
    }
  }
  return {
    bytes: buf.length,
    hasFtyp: Boolean(findBox("ftyp")),
    hasMoov: Boolean(moov),
    timescale,
    durationSeconds,
  };
}

function buildReport(data) {
  const transcript = String(data.extraction?.capture?.transcript || "");
  const lines = [
    "# C端个人IP智能体全流程自动测试记录",
    "",
    `测试时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}`,
    "",
    "## 输入",
    "",
    `- 抖音链接：${data.inputUrl}`,
    `- 样本来源：${data.discovery?.source || "manual"}`,
    data.discovery?.keyword ? `- 搜索关键词：${data.discovery.keyword}` : "",
    data.discovery?.title ? `- 搜索标题：${data.discovery.title}` : "",
    `- 目标行业：${data.industry || "未设置，参考源视频"}`,
    `- IP 人设：${data.persona || "未设置，参考源视频"}`,
    `- 转化产品：${data.offer || "未设置，轻量互动引导"}`,
    `- 头像/形象：${data.avatar?.path || data.avatar?.name || "标准素材"}`,
    `- 原片时长：${formatDuration(data.sourceDurationSeconds)}`,
    `- 万相目标时长：${data.durationSeconds}s`,
    `- 时长策略：${data.video?.durationPlan?.reason || "默认跟随原片时长，受 wan2.7-i2v 单段 2-15 秒整数限制"}`,
    "",
    "## 输出",
    "",
    `- 提取来源：${data.extraction?.source || "未完成"}`,
    `- 采集帧数：${data.extraction?.capture?.frameCount || 0}`,
    `- ASR 状态：${data.extraction?.capture?.audio?.status || ""}`,
    `- ASR 文本：${transcript || "空"}`,
    `- 提取摘要：${data.extraction?.summary || ""}`,
    `- 改写来源：${data.generated?.source || "未完成"}`,
    `- 标题：${data.generated?.title || ""}`,
    `- 脚本长度：${String(data.generated?.script || "").length}`,
    `- 音频：${data.audio?.path || data.audio?.url || data.audio?.id || ""}`,
    `- 视频任务：${data.video?.taskId || ""} / ${data.video?.status || ""}`,
    `- 本地视频：${data.localVideo || ""}`,
    `- MP4 校验：${data.mp4Info ? JSON.stringify(data.mp4Info) : "未下载"}`,
    "",
    ...(data.error
      ? [
          "## 失败信息",
          "",
          `- ${data.error.message}`,
          data.error.payload ? `- Payload：${JSON.stringify(data.error.payload).slice(0, 1000)}` : "",
          "",
        ].filter(Boolean)
      : []),
    "## 风险/观察",
    "",
    `- ${data.generated?.risks?.lead || "未返回引流风险"}`,
    `- ${data.generated?.risks?.promise || "未返回承诺风险"}`,
    `- ${data.generated?.risks?.repeat || "未返回重复风险"}`,
    "",
    "## 关联文件",
    "",
    `- ${data.outputPrefix}-capture-extract.json`,
    `- ${data.outputPrefix}-rewrite.json`,
    `- ${data.outputPrefix}-tts.json`,
    `- ${data.outputPrefix}-wan-result.json`,
  ];
  return `${lines.join("\n")}\n`;
}

function clampInt(value, min, max, fallback) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
