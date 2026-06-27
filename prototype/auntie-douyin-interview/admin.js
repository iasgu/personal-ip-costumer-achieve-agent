const list = document.querySelector("#list");
const strategyBox = document.querySelector("#strategy");
document.querySelector("#refreshBtn").addEventListener("click", load);
document.querySelector("#fuseBtn").addEventListener("click", fuseStrategy);
load();

async function load() {
  const [submissionResponse, strategyResponse] = await Promise.all([
    fetch("/api/submissions"),
    fetch("/api/strategy"),
  ]);
  const submissionData = await submissionResponse.json();
  const strategyData = await strategyResponse.json();
  const submissions = submissionData.submissions || [];
  renderStrategy(strategyData.strategy);
  list.innerHTML = submissions.length
    ? submissions.map(renderSubmission).join("")
    : `<div class="case">暂无提交</div>`;
}

async function fuseStrategy() {
  strategyBox.innerHTML = `<p class="lead">正在重新融合...</p>`;
  const response = await fetch("/api/strategy/fuse", { method: "POST" });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    strategyBox.innerHTML = `<p class="lead">融合失败：${escapeHtml(data.error || response.status)}</p>`;
    return;
  }
  renderStrategy(data.strategy);
}

function renderStrategy(strategy) {
  if (!strategy?.generatedAt) {
    strategyBox.innerHTML = `<p class="lead">暂无融合策略。</p>`;
    return;
  }
  strategyBox.innerHTML = `
    <div class="strategy-grid">
      <div><strong>${strategy.submissionCount || 0}</strong><span>总样本</span></div>
      <div><strong>${strategy.realCount || 0}</strong><span>真实填写</span></div>
      <div><strong>${strategy.syntheticCount || 0}</strong><span>合成角色</span></div>
      <div><strong>${strategy.modelGeneratedCount || 0}</strong><span>模型生成</span></div>
    </div>
    <p class="lead">更新时间：${escapeHtml(strategy.generatedAt)}</p>
    <ul class="hint-list">
      ${(strategy.hints || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>暂无提示</li>"}
    </ul>
  `;
}

function renderSubmission(item) {
  const insight = item.insight || {};
  const source = item.modelGenerated ? `模型：${item.model || "unknown"}` : item.synthetic ? "本地合成角色" : "真实手动填写";
  return `
    <section class="case">
      <div class="case-title">${escapeHtml(item.interviewee)}（${escapeHtml(source)}）</div>
      <p class="lead">${escapeHtml(item.createdAt || "")}</p>
      ${item.traits ? `<p>${escapeHtml(item.traits)}</p>` : ""}
      <p><strong>高价值线索：</strong>${escapeHtml((insight.leadSignals || []).join("；") || "暂无")}</p>
      <p><strong>负面处理：</strong>${escapeHtml((insight.negativeHandling || []).join("；") || "暂无")}</p>
      <p><strong>回复风格：</strong>${escapeHtml((insight.replyStyle || []).join("；") || "暂无")}</p>
      <p><strong>避坑：</strong>${escapeHtml((insight.avoid || []).join("；") || "暂无")}</p>
    </section>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
