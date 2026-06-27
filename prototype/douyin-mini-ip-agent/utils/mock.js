const now = () => new Date().toISOString();
const config = require("./config");

let storedCustomerServiceStrategy = normalizeStrategy(
  tt.getStorageSync("customerServiceStrategy") || config.DEFAULT_CUSTOMER_SERVICE_STRATEGY
);

function mockRequest(path, data = {}) {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (path === "/api/strategy/current") {
        resolve({
          ok: true,
          strategy: buildStrategyView()
        });
        return;
      }

      if (path === "/api/customer-service/strategy/current") {
        resolve({
          ok: true,
          strategy: storedCustomerServiceStrategy
        });
        return;
      }

      if (path === "/api/customer-service/strategy/save") {
        storedCustomerServiceStrategy = normalizeStrategy(data.strategy || data);
        tt.setStorageSync("customerServiceStrategy", storedCustomerServiceStrategy);
        resolve({
          ok: true,
          strategy: storedCustomerServiceStrategy
        });
        return;
      }

      if (path === "/api/publish/advice") {
        const advice = buildAdvice(data);
        resolve({ ok: true, ...advice });
        return;
      }

      if (path === "/api/publish/check") {
        resolve({ ok: true, risk: { level: "low", notes: [] }, checks: [{ level: "pass", message: "发布草稿基础检查通过" }] });
        return;
      }

      if (path === "/api/jobs/create") {
        const advice = buildAdvice(data);
        const job = {
          ok: true,
          jobId: `job_${Date.now()}`,
          status: "draft_ready",
          message: "视频发布草稿已生成",
          ...advice,
          videoUrl: "https://example.com/generated-personal-ip-demo.mp4",
          coverUrl: "https://example.com/generated-personal-ip-cover.jpg",
          createdAt: now()
        };
        tt.setStorageSync("mockLatestJob", job);
        resolve(job);
        return;
      }

      if (path.startsWith("/api/jobs/")) {
        resolve(tt.getStorageSync("mockLatestJob") || {
          ok: true,
          jobId: "job_demo",
          status: "draft_ready",
          ...buildAdvice(data),
          videoUrl: "https://example.com/generated-personal-ip-demo.mp4",
          coverUrl: "https://example.com/generated-personal-ip-cover.jpg",
          createdAt: now()
        });
        return;
      }

      if (path === "/api/publish/drafts") {
        resolve({
          ok: true,
          draft: {
            draftId: `draft_${Date.now()}`,
            status: "ready",
            title: data.title || "给一个爆款链接，改成你的个人IP口播",
            caption: data.caption || data.description || "",
            hashtags: data.hashtags || ["个人IP", "短视频运营", "AI获客"],
            checks: [{ level: "pass", message: "发布草稿基础检查通过" }]
          }
        });
        return;
      }

      if (path === "/api/comments") {
        resolve({
          ok: true,
          summary: { total: 3, highPriority: 1, mediumPriority: 2, lowPriority: 0, categories: { "价格咨询": 1, "素材咨询": 1, "效果质疑": 1 } },
          comments: [
            {
              commentId: "comment_001",
              userName: "想做IP的小马",
              content: "这个工具怎么收费？",
              text: "这个工具怎么收费？",
              replyStatus: "pending",
              diggCount: 18,
              likeCount: 18,
              categoryLabel: "价格咨询",
              priority: "medium",
              leadScore: 68,
              recommendedAction: "先问需求再报价"
            },
            {
              commentId: "comment_002",
              userName: "本地生活老周",
              content: "能不能用我自己的声音和头像？",
              text: "能不能用我自己的声音和头像？",
              replyStatus: "pending",
              diggCount: 9,
              likeCount: 9,
              categoryLabel: "素材咨询",
              priority: "medium",
              leadScore: 62,
              recommendedAction: "解释头像/声音流程"
            },
            {
              commentId: "comment_003",
              userName: "先看看效果",
              content: "AI做出来会不会很假？",
              text: "AI做出来会不会很假？",
              replyStatus: "pending",
              diggCount: 21,
              likeCount: 21,
              categoryLabel: "效果质疑",
              priority: "high",
              leadScore: 76,
              recommendedAction: "承认边界并引导看样片"
            }
          ]
        });
        return;
      }

      if (path.includes("/suggestions")) {
        resolve({
          ok: true,
          suggestions: [
            "可以先拿你自己的素材测一条，效果过了再聊套餐，别一上来就买。",
            "支持头像和声音，不过我建议先跑 15 秒样片，看嘴型和质感能不能过你的标准。"
          ],
          risk: { level: "low", notes: [] },
          generation: { provider: "mock", model: "local-rule", fallback: true }
        });
        return;
      }

      if (path.includes("/reply")) {
        resolve({
          ok: true,
          reply: {
            replyId: `reply_${Date.now()}`,
            status: "sent",
            reviewStatus: "mock_pass"
          }
        });
        return;
      }

      resolve({ ok: true });
    }, 350);
  });
}

function normalizeStrategy(strategy = {}) {
  const base = config.DEFAULT_CUSTOMER_SERVICE_STRATEGY;
  const merged = {
    ...base,
    ...strategy,
    workingHours: {
      ...base.workingHours,
      ...(strategy.workingHours || {})
    }
  };

  merged.businessItems = normalizeList(merged.businessItems);
  merged.replyRules = normalizeList(merged.replyRules);
  merged.handoffRules = normalizeList(merged.handoffRules);
  merged.fallbackReply = String(merged.fallbackReply || base.fallbackReply || "").trim();
  merged.prompt = String(merged.prompt || base.prompt || "").trim();
  merged.sceneName = String(merged.sceneName || base.sceneName || "").trim();
  merged.businessSummary = String(merged.businessSummary || base.businessSummary || "").trim();
  merged.tone = String(merged.tone || base.tone || "professional").trim();
  merged.humanApproval = merged.humanApproval !== false;

  return merged;
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/\n+/)
    .map((item) => item.replace(/^[\-\*\d.\s]+/, "").trim())
    .filter(Boolean);
}

function buildStrategyView() {
  const strategy = storedCustomerServiceStrategy;
  return {
    ...strategy,
    persona: "偏个人IP口语，先像真人再像工具",
    replyStyle: strategy.replyRules.join("；"),
    publishStyle: "拆爆款钩子，改成自己的案例和转化点",
    source: "mock",
    hints: [
      "先接住情绪，再回答问题",
      "价格类先问需求，不硬报价",
      "质疑类不争辩，给测试路径"
    ]
  };
}

function buildAdvice(data) {
  const persona = data.persona || "偏个人IP口语的短视频账号";
  const offer = data.offer || "给一个爆款链接，生成适合自己的真人口播视频";
  return {
    title: "给一个爆款链接，改成你的个人IP口播",
    caption: `别急着照搬爆款，先拆钩子，再换成自己的表达。${offer}`,
    script: [
      "同样一条爆款链接，普通人最缺的不是剪辑，是把它改成自己的表达。",
      `如果你是${persona}，先拆原视频的钩子、情绪和转化点，再换成你的案例。`,
      "先跑通一条，再考虑批量。短视频这件事，稳定测试比一次爆发更重要。"
    ].join("\n"),
    hashtags: ["个人IP", "短视频运营", "AI获客"],
    hooks: ["别急着剪，先拆结构。", "为什么别人能爆，你不能？", "先跑一条样片，再决定要不要批量。"],
    checks: [{ level: "pass", message: "发布草稿基础检查通过" }],
    analysis: {
      sourceUrl: data.douyinUrl || "",
      persona,
      offer,
      principles: ["接住源视频情绪", "换成个人案例", "人工确认后发布/回复"]
    },
    generation: { provider: "mock", model: "local-rule", fallback: true }
  };
}

module.exports = {
  mockRequest
};
