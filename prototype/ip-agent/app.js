const steps = [
  { id: "extract", label: "自动化提取", duration: 300 },
  { id: "script", label: "文案生成", duration: 650 },
  { id: "rewrite", label: "行业改写", duration: 650 },
  { id: "audio", label: "音频生成", duration: 650 },
  { id: "avatar", label: "数字人选择", duration: 650 },
  { id: "render", label: "成片合成", duration: 650 },
];

const sampleTranscript =
  "给你看个东西啊，这个叫全自动IP智能体。如果你不会拍摄不会剪辑，又是在做生意的，你一定要听完。我们刷到一条视频很火，点赞量几万。把链接复制下来，丢给智能体，选择全自动模式，它就自动帮你做视频。第一个动作文案生成，第二个动作改写文案，第三个动作音频生成，第四步选择数字人形象，然后开始做视频。原片和做出来的视频做对比。如果你想用，点我头像进直播间。";

const fallbackSamples = {
  餐饮: {
    structure: "痛点开场 -> 扎心事实 -> 行业危机判断 -> 内容获客解法 -> 软行动引导",
    title: "餐饮老板再不做短视频，真的会被同城流量淘汰",
    script:
      "【商业增长顾问口吻】餐饮行业已经正式进入高压阶段。\n\n告诉大家一个扎心的事实：现在不是菜品不好就没人来，而是顾客根本刷不到你。以前门店靠位置，现在门店靠内容；以前等客上门，现在要主动出现在顾客手机里。\n\n想知道你的门店适合拍什么内容，可以先点头像看一套同城获客案例。",
    tags: ["#餐饮老板", "#同城获客", "#门店增长", "#短视频运营"],
  },
  AI培训: {
    structure: "技能焦虑 -> 一键自动化展示 -> 结果对比 -> 低门槛行动",
    title: "不会写文案也能做个人IP，AI已经把流程压到一次点击",
    script:
      "【商业增长顾问口吻】很多老板不是不适合做 IP，而是被拍摄、剪辑、文案卡住了。\n\n真正该被自动化的，不是你的判断力，而是那些重复消耗时间的动作：找爆款、拆结构、改成你的行业、生成口播、适配平台、准备发布。\n\n想体验这套全自动 IP 工作流，可以先点头像看案例。",
    tags: ["#AI商业增长", "#个人IP", "#智能体", "#短视频获客"],
  },
};

const $ = (selector) => document.querySelector(selector);

const state = {
  mode: "auto",
  generatedPack: "",
  lastSource: "fallback",
  extraction: null,
  assets: {
    voice: null,
    video: null,
    history: null,
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function setGlobalStatus(text, status) {
  const pill = $("#globalStatus");
  pill.textContent = text;
  pill.className = `status-pill ${status || ""}`.trim();
}

function setStepStatus(id, status, text) {
  const card = document.querySelector(`[data-step="${id}"]`);
  const stateNode = card.querySelector(".step-state");
  card.classList.remove("running", "done");
  if (status) card.classList.add(status);
  stateNode.textContent = text;
}

function resetSteps() {
  steps.forEach((step) => setStepStatus(step.id, "", "待执行"));
}

function getFormData() {
  return {
    url: $("#videoUrl").value.trim(),
    sourceText: $("#sourceText").value.trim(),
    imageUrl: $("#imageUrl").value.trim(),
    industry: $("#industry").value,
    persona: $("#persona").value,
    offer: $("#offer").value.trim(),
    voiceBaseline: $("#voiceBaseline")?.value || "标准TTS音色",
    videoBaseline: $("#videoBaseline")?.value || "标准数字人模板",
    assetNotes: $("#assetNotes")?.value.trim() || "",
    assets: state.assets,
    mode: state.mode,
  };
}

function getBaselineSummary(formData) {
  const structure = state.extraction?.reusablePattern
    ? "爆款视频结构拆解"
    : "爆款链接/口播结构参考";
  const voice = formData.voiceBaseline || "标准TTS音色";
  const video = formData.videoBaseline || "标准数字人模板";
  const assetNotes = buildAssetNotes(formData);
  const notes = [formData.assetNotes, assetNotes].filter(Boolean).join("；") || "未补充用户资产说明";

  return {
    structure,
    voice,
    video,
    notes,
    policy: "爆款原视频只作为结构参考，不复用原声、原画面或原话术。",
  };
}

function buildAssetNotes(formData) {
  const assets = formData.assets || state.assets;
  return [
    assets.voice ? `声音样本：${assets.voice.name}` : "",
    assets.video ? `真人视频：${assets.video.name}` : "",
    assets.history ? `历史作品：${assets.history.name}` : "",
  ].filter(Boolean).join("；");
}

function getFileMeta(file) {
  if (!file) return null;
  return {
    name: file.name,
    type: file.type || "unknown",
    size: file.size,
    sizeLabel: formatFileSize(file.size),
    lastModified: file.lastModified || 0,
  };
}

function formatFileSize(size) {
  if (!Number.isFinite(size)) return "--";
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  if (size >= 1024) return `${Math.round(size / 1024)}KB`;
  return `${size}B`;
}

function fallbackBuild(formData) {
  const base = fallbackSamples[formData.industry] || fallbackSamples["餐饮"];
  const script = base.script
    .replaceAll("商业增长顾问", formData.persona)
    .replaceAll("AI获客诊断课", formData.offer || "AI获客诊断课");

  return {
    source: "fallback",
    baseline: getBaselineSummary(formData),
    originalStructure: state.extraction?.reusablePattern || base.structure,
    title: base.title,
    script,
    tags: base.tags,
    platforms: buildPlatformCopies({
      title: base.title,
      script,
      tags: base.tags,
      industry: formData.industry,
    }),
    risks: {
      lead: "低风险：使用主动查看案例的软引导表达",
      promise: "通过：未出现确定收益承诺",
      repeat: "通过：已做行业差异化改写",
    },
  };
}

function buildPlatformCopies({ title, script, tags, industry }) {
  const tagText = Array.isArray(tags) ? tags.join(" ") : tags;
  const body = script.trim();
  return {
    douyin: `${title}\n\n${script}\n\n${tagText}`,
    wechat: `今天拆一个${industry}老板必须重视的问题：\n\n${body}\n\n内容不是硬熬灵感，而是把有效结构复用到自己的业务里。`,
    red: `${title}\n\n适合${industry}账号的内容角度：\n1. 先讲行业痛点\n2. 再给用户一个判断标准\n3. 最后引导看案例或做诊断\n\n${tagText}`,
  };
}

async function callExtractApi(formData) {
  const response = await fetch("/api/video/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(formData),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `API ${response.status}`);
  }

  return response.json();
}

async function callRewriteApi(formData, extraction) {
  const response = await fetch("/api/script/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...formData,
      originalText: formData.sourceText,
      extraction: compactExtractionForRequest(extraction),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `API ${response.status}`);
  }

  return response.json();
}

function compactExtractionForRequest(extraction) {
  if (!extraction || typeof extraction !== "object") return null;
  const capture = extraction.capture || null;
  return {
    source: extraction.source,
    summary: extraction.summary,
    hook: extraction.hook,
    structure: extraction.structure,
    emotionCurve: extraction.emotionCurve,
    conversionPoint: extraction.conversionPoint,
    reusablePattern: extraction.reusablePattern,
    risks: extraction.risks,
    evidence: extraction.evidence,
    confidence: extraction.confidence,
    capture: capture ? {
      source: capture.source,
      inputType: capture.inputType,
      finalUrl: capture.finalUrl,
      title: capture.title,
      frameCount: capture.frameCount || capture.frameDataUrls?.length || 0,
      videoTarget: capture.videoTarget ? {
        duration: Number(capture.videoTarget.duration || 0),
        currentTime: Number(capture.videoTarget.currentTime || 0),
        readyState: Number(capture.videoTarget.readyState || 0),
      } : null,
      audio: capture.audio ? {
        status: capture.audio.status,
        byteLength: capture.audio.byteLength,
        contentType: capture.audio.contentType,
      } : null,
      transcript: String(capture.transcript || "").slice(0, 2000),
      capturedAt: capture.capturedAt,
    } : null,
  };
}

async function callGenerationStageApi(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text };
  }
  if (!response.ok) {
    const error = new Error(body.error || `API ${response.status}`);
    error.status = response.status;
    error.payload = body;
    throw error;
  }
  return body;
}

async function callVideoTaskApi(taskId) {
  const response = await fetch(`/api/video/tasks/${encodeURIComponent(taskId)}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

async function callVideoTaskGroupApi(groupId) {
  const response = await fetch(`/api/video/task-groups/${encodeURIComponent(groupId)}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

function updateVideoTaskStatus(result) {
  const status = $("#videoTaskStatus");
  if (!status || !result) return;
  if (result.segmented || result.taskGroupId || result.groupId) {
    const segments = result.segments || [];
    const done = segments.filter((item) => item.status === "SUCCEEDED").length;
    const failed = segments.filter((item) => ["FAILED", "CANCELED", "UNKNOWN"].includes(item.status)).length;
    const total = result.segmentCount || segments.length || 0;
    const playableUrl = getPlayableVideoUrl(result);
    status.textContent = playableUrl
      ? `分段视频已完成：${done}/${total} · ${playableUrl}`
      : `分段并行生成中：${done}/${total}${failed ? ` · 失败 ${failed}` : ""} · 任务组 ${result.taskGroupId || result.groupId}`;
    return;
  }
  const stateText = result.status || "PENDING";
  const taskText = result.taskId ? `任务 ${result.taskId}` : "未返回任务 ID";
  const playableUrl = getPlayableVideoUrl(result);
  status.textContent = playableUrl
    ? `视频生成完成：${playableUrl}`
    : `视频生成中：${stateText} · ${taskText}`;
}

async function waitForVideoTask(taskId) {
  for (let index = 0; index < 40; index += 1) {
    await sleep(index === 0 ? 5000 : 15000);
    const result = await callVideoTaskApi(taskId);
    updateVideoTaskStatus(result);
    const playableUrl = getPlayableVideoUrl(result);
    if (result.status === "SUCCEEDED" && playableUrl) {
      const video = $("#videoPreview");
      video.src = playableUrl;
      video.hidden = false;
      showToast("真人视频生成完成。");
      return result;
    }
    if (["FAILED", "CANCELED", "UNKNOWN"].includes(result.status)) {
      throw new Error(`视频任务失败：${result.status}`);
    }
  }
  throw new Error("视频任务仍在运行，请稍后查询。");
}

async function waitForVideoTaskGroup(groupId) {
  for (let index = 0; index < 60; index += 1) {
    await sleep(index === 0 ? 5000 : 15000);
    const result = await callVideoTaskGroupApi(groupId);
    updateVideoTaskStatus(result);
    const playableUrl = getPlayableVideoUrl(result);
    if (result.status === "SUCCEEDED") {
      const segmentPlayable = result.segments?.find((segment) => getPlayableVideoUrl(segment));
      const video = $("#videoPreview");
      video.src = playableUrl || getPlayableVideoUrl(segmentPlayable);
      video.hidden = !video.src;
      showToast(playableUrl ? "分段视频已生成并完成拼接。" : "分段视频已全部生成；当前服务器未拼接，先播放首段。");
      return result;
    }
    if (["FAILED", "CANCELED", "UNKNOWN"].includes(result.status)) {
      throw new Error(`分段视频任务失败：${result.status}`);
    }
  }
  throw new Error("分段视频任务仍在运行，请稍后查询。");
}

function getPlayableVideoUrl(result) {
  return result?.localVideoUrl || result?.localUrl || result?.videoUrl || result?.url || "";
}

async function callOpenLoginBrowser(formData) {
  const response = await fetch("/api/browser/open-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: formData.url || "https://www.douyin.com/" }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `API ${response.status}`);
  }

  return response.json();
}

async function callResolveVideoApi(value) {
  const response = await fetch("/api/video/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: value }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `API ${response.status}`);
  }

  return response.json();
}

async function callCaptureExtractApi(formData) {
  const response = await fetch("/api/video/capture-extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(formData),
  });

  if (!response.ok) {
    const detail = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(detail);
    } catch {
      // Keep raw detail below.
    }
    const error = new Error(payload?.error || detail || `API ${response.status}`);
    error.payload = payload;
    throw error;
  }

  return response.json();
}

function normalizeExtraction(result) {
  const fallback = {
    summary: "这个爆款内容通过痛点筛选、流程演示和结果对比，让用户相信复杂内容生产可以被自动化。",
    hook: {
      text: "如果你不会拍摄不会剪辑，又是在做生意的，你一定要听完。",
      type: "痛点筛选",
      whyItWorks: "直接点名目标人群的内容生产焦虑。",
    },
    structure: [
      {
        stage: "痛点开场",
        purpose: "筛出不会拍摄剪辑的商家",
        originalCue: "不会拍摄不会剪辑",
        reusableRule: "先说用户最怕、最卡、最耗时间的问题。",
      },
    ],
    emotionCurve: ["被戳中", "好奇", "相信", "想行动"],
    conversionPoint: {
      action: "查看案例或进入直播间",
      wordingRisk: "直接引流有平台风险",
      saferRewrite: "想看你的行业怎么做，可以先点头像看案例。",
    },
    reusablePattern: "痛点筛选 -> 爆款参照 -> 自动化演示 -> 结果对比 -> 行动引导",
    risks: {
      copycat: "只复用结构，不复刻原片话术。",
      promise: "避免承诺三秒出片或必然涨粉。",
      lead: "避免直接留联系方式。",
      fit: "需要补充行业真实痛点。",
    },
    evidence: ["使用默认口播样本推断"],
    confidence: 0.68,
  };

  return {
    source: result.source || "model",
    summary: result.summary || fallback.summary,
    hook: result.hook || fallback.hook,
    structure: Array.isArray(result.structure) && result.structure.length ? result.structure : fallback.structure,
    emotionCurve: Array.isArray(result.emotionCurve) ? result.emotionCurve : fallback.emotionCurve,
    conversionPoint: result.conversionPoint || fallback.conversionPoint,
    reusablePattern: result.reusablePattern || fallback.reusablePattern,
    risks: result.risks || fallback.risks,
    evidence: Array.isArray(result.evidence) ? result.evidence : fallback.evidence,
    confidence: Number.isFinite(Number(result.confidence)) ? Number(result.confidence) : fallback.confidence,
    capture: result.capture || null,
  };
}

function normalizeModelResult(result, formData) {
  const fallback = fallbackBuild(formData);
  const baseline = result.baseline || fallback.baseline || getBaselineSummary(formData);
  const title = result.title || fallback.title;
  const script = result.script || fallback.script;
  const tags = Array.isArray(result.tags) ? result.tags : fallback.tags;
  const platforms =
    result.platforms || buildPlatformCopies({ title, script, tags, industry: formData.industry });

  return {
    source: result.source || "model",
    baseline,
    originalStructure: result.originalStructure || result.structure || fallback.originalStructure,
    title,
    script,
    tags,
    platforms: {
      douyin: platforms.douyin || fallback.platforms.douyin,
      wechat: platforms.wechat || fallback.platforms.wechat,
      red: platforms.red || fallback.platforms.red,
    },
    risks: {
      lead: result.risks?.lead || "待人工复核：私域引导需要控制表达",
      promise: result.risks?.promise || "通过：未发现明显夸大承诺",
      repeat: result.risks?.repeat || "通过：已做行业差异化改写",
    },
  };
}

function updateExtraction(result) {
  state.extraction = result;
  updateCaptureStatus(result.capture);
  $("#extractSummary").textContent = result.summary;
  $("#extractHook").textContent = `${result.hook.text}（${result.hook.type}）`;
  $("#extractWhy").textContent = result.hook.whyItWorks;
  $("#extractPattern").textContent = result.reusablePattern;
  $("#extractConfidence").textContent = `${Math.round(result.confidence * 100)}%`;
  $("#emotionCurve").innerHTML = result.emotionCurve
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join("");
  $("#structureList").innerHTML = result.structure
    .map(
      (item, index) => `
        <li>
          <strong>${String(index + 1).padStart(2, "0")} ${escapeHtml(item.stage)}</strong>
          <p>${escapeHtml(item.purpose)}</p>
          <small>原片线索：${escapeHtml(item.originalCue)}</small>
          <small>复用规则：${escapeHtml(item.reusableRule)}</small>
        </li>
      `
    )
    .join("");
  $("#conversionPoint").textContent = `${result.conversionPoint.action}。稳妥说法：${result.conversionPoint.saferRewrite}`;
  $("#extractRisks").innerHTML = Object.entries(result.risks)
    .map(([key, value]) => `<li><strong>${riskLabel(key)}</strong><span>${escapeHtml(value)}</span></li>`)
    .join("");
  $("#originalStructure").textContent = result.reusablePattern;
}

function updateCaptureStatus(capture) {
  const status = $("#captureStatus");
  if (!status) return;
  if (!capture) {
    status.innerHTML = "<span>输入：手动文本/图片</span><span>画面帧：未采集</span><span>音频：未采集</span>";
    return;
  }
  const inputLabel = capture.inputType === "douyin-command"
    ? "复制口令"
    : capture.inputType === "douyin-shortlink"
      ? "短链"
      : capture.inputType === "douyin-page"
        ? "视频页"
        : "链接";
  const audio = capture.audio || {};
  const audioLabel = audio.status === "transcribed"
    ? `ASR完成 ${String(capture.transcript || "").length}字`
    : audio.byteLength
      ? `已录音，ASR未完成`
      : audio.status || "未采集";
  status.innerHTML = [
    `<span>输入：${escapeHtml(inputLabel)}</span>`,
    `<span>画面帧：${escapeHtml(capture.frameCount || capture.frameDataUrls?.length || 0)}帧</span>`,
    `<span>原片：${escapeHtml(formatDuration(capture.videoTarget?.duration || capture.durationSeconds || capture.duration || 0))}</span>`,
    `<span>音频：${escapeHtml(audioLabel)}</span>`,
  ].join("");
}

function getSourceVideoDurationSeconds(extraction) {
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

function getSingleSegmentDurationSeconds(extraction) {
  const sourceDuration = getSourceVideoDurationSeconds(extraction);
  if (!sourceDuration) return 10;
  return Math.min(15, Math.max(2, Math.round(sourceDuration)));
}

function formatDuration(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "未知时长";
  return `${seconds.toFixed(seconds >= 10 ? 1 : 2)}秒`;
}

function updateResults(result) {
  updateBaseline(result.baseline || getBaselineSummary(getFormData()));
  $("#originalStructure").textContent = result.originalStructure;
  $("#generatedScript").value = result.script;
  $("#captionBox").textContent = result.script.split("\n\n")[0] || result.script.slice(0, 70);
  $("#videoTitle").textContent = result.title;
  $("#videoTags").textContent = result.tags.join(" ");
  $("#douyinCopy").textContent = result.platforms.douyin;
  $("#wechatCopy").textContent = result.platforms.wechat;
  $("#redCopy").textContent = result.platforms.red;
  $("#riskLead").textContent = result.risks.lead;
  $("#riskLead").className = "safe";
  $("#riskPromise").textContent = result.risks.promise;
  $("#riskPromise").className = "safe";
  $("#riskRepeat").textContent = result.risks.repeat;
  $("#riskRepeat").className = "safe";

  const baseline = result.baseline || getBaselineSummary(getFormData());
  const baselineLines = [
    "生成基准：",
    `- 结构：${baseline.structure || "爆款结构参考"}`,
    `- 声音：${baseline.voice || "标准TTS音色"}`,
    `- 视频：${baseline.video || "标准数字人模板"}`,
    `- 资产说明：${baseline.notes || "未补充"}`,
    `- 合规边界：${baseline.policy || "爆款原视频只作为结构参考，不复用原声原画面。"}`,
  ];

  state.generatedPack = [
    ...baselineLines,
    "",
    `生成来源：${result.source === "model" ? "百炼模型直连" : "本地兜底模板"}`,
    "",
    `第一步提取：${state.extraction?.reusablePattern || "未提取"}`,
    "",
    `爆款结构：${result.originalStructure}`,
    "",
    `标题：${result.title}`,
    "",
    `口播文案：\n${result.script}`,
    "",
    `抖音版：\n${result.platforms.douyin}`,
    "",
    `视频号版：\n${result.platforms.wechat}`,
    "",
    `小红书版：\n${result.platforms.red}`,
  ].join("\n");
}

function updateBaseline(baseline) {
  const list = $("#baselineList");
  if (!list) return;
  list.innerHTML = [
    ["结构", baseline.structure || "爆款结构参考"],
    ["声音", baseline.voice || "标准TTS音色"],
    ["视频", baseline.video || "标准数字人模板"],
    ["说明", baseline.notes || "未补充用户资产说明"],
  ]
    .map(([label, value]) => `<li><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></li>`)
    .join("");
}

async function extractContent(formData) {
  if (formData.url) {
    try {
      setGlobalStatus("登录态采集中", "running");
      $("#extractSummary").textContent = "正在解析口令/短链，自动打开登录态浏览器采集真实视频画面帧和原视频音频。";
      const extraction = normalizeExtraction(await callCaptureExtractApi(formData));
      state.lastSource = extraction.source;
      return extraction;
    } catch (error) {
      console.warn("Capture extract unavailable, falling back to normal extract.", error);
      updateCaptureStatus(error.payload?.capture || null);
      showToast("登录态采集未完成，已降级用链接/文本进行结构提取。");
    }
  }

  try {
    const extraction = normalizeExtraction(await callExtractApi(formData));
    state.lastSource = extraction.source;
    return extraction;
  } catch (error) {
    console.warn("Extract API unavailable, using fallback.", error);
    const extraction = normalizeExtraction({ source: "fallback" });
    extraction.source = "fallback";
    state.lastSource = "fallback";
    showToast("自动化提取接口暂不可用，已使用本地结构兜底。");
    return extraction;
  }
}

async function captureAndAnalyze() {
  const formData = getFormData();
  if (!formData.url) {
    showToast("请先粘贴抖音视频链接。");
    return;
  }

  const button = $("#captureAnalyze");
  button.disabled = true;
  setGlobalStatus("解析口令/短链中", "running");
  setStepStatus("extract", "running", "采集中");
  $("#extractSummary").textContent = "正在解析抖音复制口令/短链，然后用登录态浏览器打开真实视频页，只抽取视频画面帧和原视频音频。";

  try {
    const resolved = await callResolveVideoApi(formData.url);
    if (!resolved.ok) {
      throw new Error(resolved.message || "未识别到可打开的抖音链接。");
    }
    showToast(resolved.inputType === "douyin-command" ? "已解析复制口令，正在打开视频页。" : "已识别视频链接，正在采集。");
    setGlobalStatus("登录态采集中", "running");
    const result = normalizeExtraction(await callCaptureExtractApi(formData));
    updateExtraction(result);
    state.lastSource = result.source;
    setStepStatus("extract", "done", "已完成");
    setGlobalStatus("多模态提取完成", "done");
    const capture = result.capture;
    showToast(`已抽取 ${capture?.frameCount || capture?.frameDataUrls?.length || 0} 帧视频画面并完成多模态分析。`);
  } catch (error) {
    console.warn("Capture extract failed.", error);
    updateCaptureStatus(error.payload?.capture || null);
    $("#extractSummary").textContent = error.message || "采集失败，未拿到真实视频画面。";
    setStepStatus("extract", "", "待执行");
    setGlobalStatus("采集失败", "");
    showToast(error.message || "登录态采集失败：请确认已在独立浏览器窗口登录抖音。");
  } finally {
    if (button) button.disabled = false;
  }
}

async function generateContent(formData, extraction) {
  try {
    const modelResult = await callRewriteApi(formData, extraction);
    const normalized = normalizeModelResult(modelResult, formData);
    state.lastSource = normalized.source;
    return normalized;
  } catch (error) {
    console.warn("Rewrite API unavailable, using fallback.", error);
    state.lastSource = "fallback";
    showToast("文案改写接口暂不可用，已使用本地模板兜底。");
    return fallbackBuild(formData);
  }
}

async function runPipeline() {
  const formData = getFormData();
  if (!formData.url && !formData.sourceText && !formData.imageUrl) {
    showToast("请先粘贴爆款链接、原始口播或图片 URL。");
    return;
  }

  const runButton = $("#runButton");
  const playButton = $("#playButton");
  runButton.disabled = true;
  playButton.disabled = true;
  resetSteps();
  setGlobalStatus("自动执行中", "running");
  $("#runtimeMetric").textContent = "00:00";

  const startedAt = Date.now();
  const timer = window.setInterval(() => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    $("#runtimeMetric").textContent = `00:${String(seconds).padStart(2, "0")}`;
  }, 250);

  let extraction = null;
  let generated = null;
  let audioResult = null;
  let avatarResult = null;

  for (const step of steps) {
    const stepStartedAt = Date.now();
    setStepStatus(step.id, "running", "执行中");

    if (step.id === "extract") {
      $("#extractSummary").textContent = formData.url
        ? "正在自动解析链接并采集真实视频画面帧、音频和字幕..."
        : "正在解析爆款结构、钩子、情绪曲线和转化动作...";
      extraction = await extractContent(formData);
      updateExtraction(extraction);
    } else if (step.id === "rewrite") {
      generated = await generateContent(formData, extraction);
      updateResults(generated);
    } else if (step.id === "audio") {
      await ensureGenerationAssets({ needVoice: false, needVideo: false });
      audioResult = await callGenerationStageApi("/api/audio/synthesize", {
        ...getFormData(),
        extraction: compactExtractionForRequest(extraction),
        generated,
        script: generated?.script,
      });
      $("#captionBox").textContent = `配音已生成：${audioResult.url || audioResult.path || audioResult.id}`;
    } else if (step.id === "avatar") {
      await ensureGenerationAssets({ needVoice: true, needVideo: true });
      avatarResult = await callGenerationStageApi("/api/video/avatar-render", {
        ...getFormData(),
        extraction: compactExtractionForRequest(extraction),
        generated,
        audio: audioResult,
        script: generated?.script,
        sourceDurationSeconds: getSourceVideoDurationSeconds(extraction),
        durationSeconds: getSingleSegmentDurationSeconds(extraction),
      });
      updateVideoTaskStatus(avatarResult);
    } else if (step.id === "render") {
      let finalResult = null;
      if ((avatarResult?.taskGroupId || avatarResult?.groupId) && !avatarResult.videoUrl && !avatarResult.url) {
        finalResult = await waitForVideoTaskGroup(avatarResult.taskGroupId || avatarResult.groupId);
      } else if (avatarResult?.taskId && !avatarResult.videoUrl && !avatarResult.url) {
        finalResult = await waitForVideoTask(avatarResult.taskId);
      } else if (avatarResult?.videoUrl || avatarResult?.url) {
        finalResult = avatarResult;
      } else {
        finalResult = await callGenerationStageApi("/api/video/finalize", {
          ...getFormData(),
          extraction: compactExtractionForRequest(extraction),
          generated,
          audio: audioResult,
          avatar: avatarResult,
        });
      }
      const playableUrl = getPlayableVideoUrl(finalResult);
      if (playableUrl) {
        $("#videoPreview").src = playableUrl;
        $("#videoPreview").hidden = false;
      }
    } else {
      await sleep(step.duration);
    }

    setStepStatus(step.id, "done", "已完成");
    console.log(`[pipeline] ${step.id} ${Date.now() - stepStartedAt}ms`);

    if (false && step.id === "audio") {
      $("#captionBox").textContent = "配音已生成：商业顾问声线，语速偏快，适合短视频开场。";
    }
    if (step.id === "render" && generated) {
      updateResults(generated);
    }
  }

  window.clearInterval(timer);
  $("#runtimeMetric").textContent = `00:${String(Math.max(5, Math.floor((Date.now() - startedAt) / 1000))).padStart(2, "0")}`;
  runButton.disabled = false;
  playButton.disabled = false;
  setGlobalStatus(state.lastSource === "model" ? "模型生成完成" : "兜底生成完成", "done");
  showToast(state.lastSource === "model" ? "第一步提取和内容包生成已完成。" : "内容包已生成，可先演示流程。");
}

async function ensureGenerationAssets({ needVoice = false, needVideo = false } = {}) {
  const missingVoice = needVoice && !state.assets.voice?.path && !state.assets.voice?.url;
  const missingVideo = needVideo && !state.assets.video?.path && !state.assets.video?.url;
  if (!missingVoice && !missingVideo) return;

  const missingLabel = missingVoice && missingVideo
    ? "用户形象和声音素材"
    : missingVoice
      ? "用户声音素材"
      : "用户形象素材";
  showToast(`未检测到${missingLabel}，正在自动安装标准测试素材跑通链路。`);
  const assets = await installStandardAssets();
  if (missingVoice && assets.voice) {
    state.assets.voice = assets.voice;
    const label = $("#voiceAssetName");
    if (label) label.textContent = `${assets.voice.name} · ${assets.voice.sizeLabel} · 标准素材`;
  }
  if (missingVideo && assets.video) {
    state.assets.video = assets.video;
    const label = $("#videoAssetName");
    if (label) label.textContent = `${assets.video.name} · ${assets.video.sizeLabel} · 标准素材`;
  }
  const voiceSelect = $("#voiceBaseline");
  const videoSelect = $("#videoBaseline");
  if (missingVoice && voiceSelect) voiceSelect.value = "用户上传音频";
  if (missingVideo && videoSelect) videoSelect.value = "用户上传真人视频";
  updateBaseline(getBaselineSummary(getFormData()));
}

function bindTabs() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
      button.classList.add("active");
      $(`#tab-${button.dataset.tab}`).classList.add("active");
    });
  });
}

function bindModeSwitch() {
  document.querySelectorAll(".mode").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      document.querySelectorAll(".mode").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      showToast(state.mode === "auto" ? "已切换为全自动模式。" : "已切换为人工审核模式。");
    });
  });
}

function bindAssetUploads() {
  const bindings = [
    {
      input: "#voiceAsset",
      label: "#voiceAssetName",
      key: "voice",
      baseline: "#voiceBaseline",
      baselineValue: "用户上传音频",
      empty: "支持 mp3/wav/m4a，用于声音基准",
    },
    {
      input: "#videoAsset",
      label: "#videoAssetName",
      key: "video",
      baseline: "#videoBaseline",
      baselineValue: "用户上传真人视频",
      empty: "支持 mp4/mov，用于形象/口型基准",
    },
    {
      input: "#historyAsset",
      label: "#historyAssetName",
      key: "history",
      baseline: null,
      baselineValue: "",
      empty: "用于账号风格、镜头、字幕基准",
    },
  ];

  bindings.forEach((item) => {
    const input = $(item.input);
    if (!input) return;
    input.addEventListener("change", async () => {
      const file = input.files?.[0] || null;
      const label = $(item.label);
      if (!file) {
        state.assets[item.key] = null;
        if (label) label.textContent = item.empty;
        showToast("已清除资产文件。");
        updateBaseline(getBaselineSummary(getFormData()));
        return;
      }

      let uploadFile = file;
      let localMeta = getFileMeta(file);
      if (item.key === "video" && file.type?.startsWith("video/")) {
        if (label) label.textContent = `抽取首帧中：${file.name} · ${localMeta.sizeLabel}`;
        uploadFile = await extractFirstFrameFile(file);
        localMeta = getFileMeta(uploadFile);
      }
      if (label) label.textContent = `上传中：${uploadFile.name} · ${localMeta.sizeLabel}`;
      showToast("正在上传用户资产...");
      try {
        const asset = await uploadAssetFile(item.key, uploadFile);
        if (uploadFile !== file) {
          asset.originalVideoName = file.name;
          asset.firstFrameExtracted = true;
        }
        state.assets[item.key] = asset;
        if (label) {
          const suffix = uploadFile !== file ? ` · 已抽首帧自 ${file.name}` : "";
          label.textContent = `${asset.name} · ${asset.sizeLabel || localMeta.sizeLabel} · 已上传${suffix}`;
        }
        if (item.baseline) {
          const select = $(item.baseline);
          if (select) select.value = item.baselineValue;
        }
        showToast(`已上传 ${asset.name}，可作为生成基准。`);
      } catch (error) {
        console.warn("Asset upload failed.", error);
        state.assets[item.key] = null;
        input.value = "";
        if (label) label.textContent = item.empty;
        showToast(`上传失败：${error.message || "请检查文件格式/大小"}`);
      }
      updateBaseline(getBaselineSummary(getFormData()));
      return;
      if (label) {
        label.textContent = file ? `${file.name} · ${formatFileSize(file.size)}` : item.empty;
      }
      if (file && item.baseline) {
        const select = $(item.baseline);
        if (select) select.value = item.baselineValue;
      }
      showToast(file ? `已读取${file.name}作为IP资产基准。` : "已清除资产文件。");
      updateBaseline(getBaselineSummary(getFormData()));
    });
  });
}

async function extractFirstFrameFile(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;
    await once(video, "loadedmetadata");
    const seekTo = Math.min(0.5, Math.max(0, Number(video.duration || 1) / 10));
    await new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("首帧抽取超时")), 8000);
      video.currentTime = seekTo;
      video.addEventListener("seeked", () => {
        window.clearTimeout(timer);
        resolve();
      }, { once: true });
      video.addEventListener("error", () => {
        window.clearTimeout(timer);
        reject(new Error("无法读取上传视频"));
      }, { once: true });
    });
    const width = Math.max(1, video.videoWidth || 720);
    const height = Math.max(1, video.videoHeight || 1280);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器不支持 Canvas 首帧抽取");
    ctx.drawImage(video, 0, 0, width, height);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((item) => item ? resolve(item) : reject(new Error("首帧编码失败")), "image/jpeg", 0.92);
    });
    const safeName = file.name.replace(/\.[^.]+$/, "") || "avatar";
    return new File([blob], `${safeName}-first-frame.jpg`, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function once(target, eventName) {
  return new Promise((resolve, reject) => {
    target.addEventListener(eventName, resolve, { once: true });
    target.addEventListener("error", () => reject(new Error(`等待 ${eventName} 失败`)), { once: true });
  });
}

async function uploadAssetFile(kind, file) {
  const formData = new FormData();
  formData.append("kind", kind);
  formData.append("file", file, file.name);
  const response = await fetch("/api/assets/upload", {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload.asset;
}

async function installStandardAssets() {
  const response = await fetch("/api/assets/standard/install", {
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload.assets;
}

async function recordVoiceAsset() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new Error("当前浏览器不支持录音。");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };
  return new Promise((resolve, reject) => {
    recorder.onerror = () => reject(new Error("录音失败。"));
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
      const file = new File([blob], `recorded-voice-${Date.now()}.webm`, { type: blob.type || "audio/webm" });
      resolve(uploadAssetFile("voice", file));
    };
    recorder.start();
    setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, 10000);
  });
}

function bindActions() {
  $("#runButton").addEventListener("click", () => {
    runPipeline().catch((error) => {
      console.warn("Pipeline failed.", error);
      const runningCard = document.querySelector(".step.running");
      const failedId = runningCard?.dataset?.step;
      if (failedId) setStepStatus(failedId, "", error.status === 501 ? "待配置" : "失败");
      $("#runButton").disabled = false;
      $("#playButton").disabled = false;
      setGlobalStatus("生成未完成", "");
      showToast(error.message || "生成失败，请查看当前步骤提示。");
    });
  });
  $("#openLoginBrowser")?.addEventListener("click", async () => {
    try {
      await callOpenLoginBrowser(getFormData());
      showToast("已打开登录浏览器，请在新窗口完成抖音登录。");
    } catch (error) {
      console.warn("Open login browser failed.", error);
      showToast("打开登录浏览器失败，请检查是否安装 Chrome 或 Edge。");
    }
  });
  $("#captureAnalyze")?.addEventListener("click", captureAndAnalyze);
  $("#useStandardAssets")?.addEventListener("click", async () => {
    const button = $("#useStandardAssets");
    button.disabled = true;
    showToast("正在安装标准测试素材...");
    try {
      const assets = await installStandardAssets();
      state.assets.voice = assets.voice;
      state.assets.video = assets.video;
      $("#voiceAssetName").textContent = `${assets.voice.name} · ${assets.voice.sizeLabel} · 标准素材`;
      $("#videoAssetName").textContent = `${assets.video.name} · ${assets.video.sizeLabel} · 标准素材`;
      const voiceSelect = $("#voiceBaseline");
      const videoSelect = $("#videoBaseline");
      if (voiceSelect) voiceSelect.value = "用户上传音频";
      if (videoSelect) videoSelect.value = "用户上传真人视频";
      updateBaseline(getBaselineSummary(getFormData()));
      showToast("标准素材已安装，可用于验证生成通路。");
    } catch (error) {
      console.warn("Install standard assets failed.", error);
      showToast(`标准素材安装失败：${error.message || "网络不可用"}`);
    } finally {
      button.disabled = false;
    }
  });
  $("#recordVoiceAsset")?.addEventListener("click", async () => {
    const button = $("#recordVoiceAsset");
    const label = $("#recordVoiceAssetName");
    button.disabled = true;
    if (label) label.textContent = "录音中：请说话，10 秒后自动上传";
    showToast("开始录音，请对着麦克风说话。");
    try {
      const asset = await recordVoiceAsset();
      state.assets.voice = asset;
      $("#voiceAssetName").textContent = `${asset.name} · ${asset.sizeLabel} · 已录制`;
      if (label) label.textContent = "录音已上传，可重新录制";
      const voiceSelect = $("#voiceBaseline");
      if (voiceSelect) voiceSelect.value = "用户上传音频";
      updateBaseline(getBaselineSummary(getFormData()));
      showToast("录音已上传为声音样本。");
    } catch (error) {
      console.warn("Record voice failed.", error);
      if (label) label.textContent = "录音失败，可重试";
      showToast(error.message || "录音失败，请检查麦克风权限。");
    } finally {
      button.disabled = false;
    }
  });
  $("#pasteSample").addEventListener("click", () => {
    $("#videoUrl").value = "https://www.douyin.com/video/7380678787580562707";
    $("#sourceText").value = sampleTranscript;
    showToast("已填入真实抖音视频页样例和口播。");
  });
  $("#copyPack").addEventListener("click", async () => {
    const text = state.generatedPack || $("#generatedScript").value;
    try {
      await navigator.clipboard.writeText(text);
      showToast("内容包已复制。");
    } catch {
      showToast("浏览器不允许自动复制，可以手动选中文案复制。");
    }
  });
  $("#playButton").addEventListener("click", () => {
    const phone = document.querySelector(".phone-preview");
    phone.classList.toggle("playing");
    $("#playButton").textContent = phone.classList.contains("playing") ? "暂停" : "播放";
  });
}

function riskLabel(key) {
  return {
    copycat: "搬运风险",
    promise: "夸大承诺",
    lead: "引流风险",
    fit: "行业适配",
  }[key] || key;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

bindTabs();
bindModeSwitch();
bindAssetUploads();
bindActions();
