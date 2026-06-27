const baseUrl = process.env.COMMENT_AGENT_BASE_URL || "http://127.0.0.1:8893";

const results = [];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  await test("health", async () => {
    const data = await api("/api/health");
    assert(data.ok, "health ok");
    assert(data.module === "douyin-comment-reply-agent", "module name");
    assert(Object.prototype.hasOwnProperty.call(data, "llmConfigured"), "llm metadata");
  });

  await test("reset mock", async () => {
    const data = await api("/api/reset-mock", { method: "POST" });
    assert(data.ok, "reset ok");
  });

  await test("list comments with analysis", async () => {
    const data = await api("/api/comments?itemId=item_demo");
    assert(data.comments.length >= 10, "has extended mock comments");
    const cooperation = data.comments.find((item) => item.commentId === "comment_007");
    assert(cooperation.category === "business_cooperation", "cooperation category");
    assert(cooperation.priority === "high", "cooperation high priority");
    assert(cooperation.leadScore >= 80, "cooperation high lead score");
    const negative = data.comments.find((item) => item.commentId === "comment_008");
    assert(negative.category === "negative_attack", "negative category");
    const industry = data.comments.find((item) => item.commentId === "comment_005");
    assert(industry.category === "industry_fit", "industry fit category");
    assert(industry.analysis.labels.some((item) => item.key === "industry"), "industry label");
    const mixed = data.comments.find((item) => item.commentId === "comment_001");
    assert(mixed.analysis.labels.length >= 2, "mixed labels");
    assert(data.summary.highPriority >= 3, "summary high priority");
  });

  await test("suggestions include analysis", async () => {
    const data = await api("/api/comments/comment_006/suggestions", {
      method: "POST",
      body: JSON.stringify({ commentText: "能不能帮我看看我的账号？我发了半个月没流量。" }),
    });
    assert(data.analysis.category === "account_diagnosis", "account diagnosis category");
    assert(data.suggestions.some((item) => item.includes("账号") || item.includes("方向")), "account suggestion");
  });

  await test("risk blocks forbidden promise", async () => {
    const data = await api("/api/comments/comment_009/reply", {
      method: "POST",
      body: JSON.stringify({ itemId: "item_demo", text: "我保证你一个月涨粉一万，百分百有效。" }),
      expectError: true,
    });
    assert(data.ok === false, "blocked response");
    assert(String(data.error || "").includes("风险"), "risk error");
  });

  await test("manual reply success", async () => {
    const replyText = "这个不能保证，短视频没有百分百结果。建议先拿一条真实视频测，看质量和反馈再决定。";
    const data = await api("/api/comments/comment_009/reply", {
      method: "POST",
      body: JSON.stringify({ itemId: "item_demo", text: replyText }),
    });
    assert(data.ok, "reply ok");
    assert(data.reply.reviewStatus === "mock_pass", "mock pass");
  });

  await test("reply persisted", async () => {
    const data = await api("/api/comments?itemId=item_demo");
    const comment = data.comments.find((item) => item.commentId === "comment_009");
    assert(comment.replyStatus === "replied", "comment replied");
    const replies = await api("/api/replies");
    assert(replies.replies.length >= 1, "reply record exists");
  });

  await test("ignore status", async () => {
    const data = await api("/api/comments/comment_008/status", {
      method: "POST",
      body: JSON.stringify({ status: "ignored", reason: "负面攻击不争辩" }),
    });
    assert(data.comment.replyStatus === "ignored", "ignored status");
  });

  await test("batch high priority suggestions", async () => {
    await api("/api/reset-mock", { method: "POST" });
    const data = await api("/api/comments/batch-suggestions", {
      method: "POST",
      body: JSON.stringify({ itemId: "item_demo", priority: "high", limit: 3 }),
    });
    assert(data.count === 3, "batch count");
    assert(data.items.every((item) => item.comment.priority === "high"), "all high priority");
    assert(data.items.every((item) => item.suggestions.length >= 1), "has suggestions");
  });

  await test("generation metadata fallback", async () => {
    const data = await api("/api/comments/comment_001/suggestions", {
      method: "POST",
      body: JSON.stringify({ commentText: "How much and can you help check my account?" }),
    });
    assert(data.generation && data.generation.provider, "generation provider");
    assert(typeof data.generation.fallback === "boolean", "generation fallback flag");
  });

  await test("ops report markdown", async () => {
    const text = await apiText("/api/report?itemId=item_demo&format=md");
    assert(text.includes("# 抖音评论互动运营报告"), "report title");
    assert(text.includes("## 高价值线索"), "high value section");
    assert(text.includes("## 回复 SOP"), "sop section");
  });

  printSummary();
}

async function test(name, fn) {
  const startedAt = Date.now();
  try {
    await fn();
    const ms = Date.now() - startedAt;
    results.push({ name, status: "PASS", ms });
    console.log(`PASS ${name} ${ms}ms`);
  } catch (error) {
    const ms = Date.now() - startedAt;
    results.push({ name, status: "FAIL", ms, error: error.message });
    console.error(`FAIL ${name} ${ms}ms ${error.message}`);
    throw error;
  }
}

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json" },
    method: options.method || "GET",
    body: options.body,
  });
  const data = await response.json().catch(() => ({}));
  if (!options.expectError && (!response.ok || data.ok === false)) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function apiText(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();
  if (!response.ok) throw new Error(text || `HTTP ${response.status}`);
  return text;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function printSummary() {
  const passed = results.filter((item) => item.status === "PASS").length;
  const failed = results.length - passed;
  console.log(JSON.stringify({ passed, failed, results }, null, 2));
}
