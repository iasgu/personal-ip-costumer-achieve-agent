const state = {
  itemId: "item_demo",
  comments: [],
  filter: "all",
  search: "",
};

const el = {
  itemIdInput: document.querySelector("#itemIdInput"),
  loadBtn: document.querySelector("#loadBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  batchBtn: document.querySelector("#batchBtn"),
  reportBtn: document.querySelector("#reportBtn"),
  copyReportBtn: document.querySelector("#copyReportBtn"),
  reportBox: document.querySelector("#reportBox"),
  filterSelect: document.querySelector("#filterSelect"),
  searchInput: document.querySelector("#searchInput"),
  commentList: document.querySelector("#commentList"),
  commentCount: document.querySelector("#commentCount"),
  adapterBadge: document.querySelector("#adapterBadge"),
  healthTitle: document.querySelector("#healthTitle"),
  healthText: document.querySelector("#healthText"),
  rulesText: document.querySelector("#rulesText"),
  summaryBar: document.querySelector("#summaryBar"),
  toast: document.querySelector("#toast"),
};

el.loadBtn.addEventListener("click", () => loadComments(el.itemIdInput.value || "item_demo"));
el.resetBtn.addEventListener("click", resetMock);
el.batchBtn?.addEventListener("click", batchSuggest);
el.reportBtn?.addEventListener("click", loadReport);
el.copyReportBtn?.addEventListener("click", copyReport);
el.filterSelect?.addEventListener("change", () => {
  state.filter = el.filterSelect.value;
  renderComments();
});
el.searchInput?.addEventListener("input", () => {
  state.search = el.searchInput.value.trim();
  renderComments();
});

boot();

async function boot() {
  await loadHealth();
  await loadComments("item_demo");
}

async function loadHealth() {
  const data = await api("/api/health");
  el.adapterBadge.textContent = data.adapter;
  el.healthTitle.textContent = data.configured ? "OpenAPI 已配置" : "当前 mock 模式";
  el.healthText.textContent = data.configured ? `${data.appType} adapter ready` : "可先演示回复闭环，等授权后切真实接口";
  el.rulesText.textContent = data.auntieRulesLoaded ? `已加载舅妈规则：${data.auntieRulesSource}` : "未加载舅妈规则，使用内置规则";
}

async function loadComments(itemId) {
  state.itemId = itemId;
  const data = await api(`/api/comments?itemId=${encodeURIComponent(itemId)}`);
  state.comments = data.comments || [];
  state.summary = data.summary || null;
  renderComments();
}

function renderComments() {
  el.commentCount.textContent = `${state.comments.length} 条`;
  renderSummary();
  const visible = getVisibleComments();
  el.commentCount.textContent = `${visible.length}/${state.comments.length} 条`;
  el.commentList.innerHTML = visible.length
    ? visible.map(renderComment).join("")
    : `<div class="empty">暂无评论。</div>`;

  el.commentList.querySelectorAll("[data-suggest]").forEach((btn) => {
    btn.addEventListener("click", () => suggest(btn.dataset.suggest));
  });
  el.commentList.querySelectorAll("[data-reply]").forEach((btn) => {
    btn.addEventListener("click", () => reply(btn.dataset.reply));
  });
  el.commentList.querySelectorAll("[data-ignore]").forEach((btn) => {
    btn.addEventListener("click", () => updateStatus(btn.dataset.ignore, "ignored", "运营判断无需回复"));
  });
  el.commentList.querySelectorAll("[data-handle]").forEach((btn) => {
    btn.addEventListener("click", () => updateStatus(btn.dataset.handle, "handled", "已线下处理"));
  });
  el.commentList.querySelectorAll("[data-use]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelector(`[data-reply-text="${cssEscape(btn.dataset.use)}"]`).value = btn.textContent.trim();
    });
  });
}

function getVisibleComments() {
  return state.comments.filter((comment) => {
    if (state.filter !== "all" && comment.priority !== state.filter && comment.category !== state.filter && comment.replyStatus !== state.filter) return false;
    if (state.search) {
      const haystack = `${comment.userName} ${comment.content} ${comment.categoryLabel} ${comment.recommendedAction}`;
      if (!haystack.includes(state.search)) return false;
    }
    return true;
  });
}

function renderSummary() {
  if (!state.summary) {
    el.summaryBar.innerHTML = "";
    return;
  }
  const categories = Object.entries(state.summary.categories || {})
    .map(([name, count]) => `<span class="summary-chip">${escapeHtml(name)} ${count}</span>`)
    .join("");
  el.summaryBar.innerHTML = `
    <span class="summary-chip hot">高优先级 ${Number(state.summary.highPriority || 0)}</span>
    <span class="summary-chip">中优先级 ${Number(state.summary.mediumPriority || 0)}</span>
    <span class="summary-chip">低优先级 ${Number(state.summary.lowPriority || 0)}</span>
    ${categories}
  `;
}

function renderComment(comment) {
  const suggestions = (comment.suggestions || [])
    .map((text) => `<button class="suggestion" type="button" data-use="${escapeHtml(comment.commentId)}">${escapeHtml(text)}</button>`)
    .join("");
  return `
    <div class="comment priority-${escapeHtml(comment.priority || "low")}" id="comment-${escapeHtml(comment.commentId)}">
      <div class="comment-top">
        <div>
          <div class="comment-user">${escapeHtml(comment.userName)}</div>
          <div class="muted">${Number(comment.diggCount || 0)} 赞 · ${escapeHtml(comment.replyStatus || "pending")}</div>
        </div>
        <div class="badge-stack">
          <span class="badge">${comment.replyStatus === "replied" ? "已回复" : "待回复"}</span>
          <span class="score-badge">${Number(comment.leadScore || 0)}分</span>
        </div>
      </div>
      <div class="ops-row">
        <span class="category">${escapeHtml(comment.categoryLabel || "普通互动")}</span>
        <span class="priority">${escapeHtml(priorityLabel(comment.priority))}</span>
        <span class="action">${escapeHtml(comment.recommendedAction || "可回复")}</span>
      </div>
      ${renderLabels(comment)}
      ${renderReasons(comment)}
      <div class="comment-text">${escapeHtml(comment.content)}</div>
      <div class="suggestions">${suggestions}</div>
      <textarea class="reply-text" data-reply-text="${escapeHtml(comment.commentId)}" placeholder="生成建议后可编辑">${escapeHtml(comment.replyText || "")}</textarea>
      <div class="actions">
        <button type="button" data-suggest="${escapeHtml(comment.commentId)}">生成建议</button>
        <button type="button" data-reply="${escapeHtml(comment.commentId)}">人工确认回复</button>
        <button type="button" data-ignore="${escapeHtml(comment.commentId)}">忽略</button>
        <button type="button" data-handle="${escapeHtml(comment.commentId)}">标记处理</button>
      </div>
    </div>
  `;
}

function renderLabels(comment) {
  const labels = comment.analysis?.labels || [];
  if (!labels.length) return "";
  return `<div class="label-row">${labels.map((item) => `<span>${escapeHtml(item.label)}</span>`).join("")}</div>`;
}

function renderReasons(comment) {
  const reasons = comment.analysis?.reasons || [];
  if (!reasons.length) return "";
  return `<div class="reason-row">${reasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")}</div>`;
}

function priorityLabel(priority) {
  if (priority === "high") return "高优先级";
  if (priority === "medium") return "中优先级";
  return "低优先级";
}

async function suggest(commentId) {
  const comment = state.comments.find((item) => item.commentId === commentId);
  if (!comment) return;
  const data = await api(`/api/comments/${encodeURIComponent(commentId)}/suggestions`, {
    method: "POST",
    body: JSON.stringify({ commentText: comment.content }),
  });
  comment.analysis = data.analysis || comment.analysis;
  comment.category = data.analysis?.category || comment.category;
  comment.categoryLabel = data.analysis?.categoryLabel || comment.categoryLabel;
  comment.leadScore = data.analysis?.leadScore ?? comment.leadScore;
  comment.priority = data.analysis?.priority || comment.priority;
  comment.recommendedAction = data.analysis?.recommendedAction || comment.recommendedAction;
  comment.suggestions = data.suggestions || [];
  comment.replyText = comment.suggestions[0] || "";
  renderComments();
  showToast("已生成回复建议");
}

async function reply(commentId) {
  const textarea = document.querySelector(`[data-reply-text="${cssEscape(commentId)}"]`);
  const text = textarea?.value || "";
  const data = await api(`/api/comments/${encodeURIComponent(commentId)}/reply`, {
    method: "POST",
    body: JSON.stringify({ itemId: state.itemId, text }),
  });
  showToast(`回复已提交：${data.reply.replyId}`);
  await loadComments(state.itemId);
}

async function resetMock() {
  await api("/api/reset-mock", { method: "POST" });
  await loadComments(state.itemId);
  showToast("mock 数据已重置");
}

async function batchSuggest() {
  const data = await api("/api/comments/batch-suggestions", {
    method: "POST",
    body: JSON.stringify({ itemId: state.itemId, priority: "high", limit: 5 }),
  });
  for (const item of data.items || []) {
    const target = state.comments.find((comment) => comment.commentId === item.comment.commentId);
    if (target) {
      target.suggestions = item.suggestions || [];
      target.replyText = target.suggestions[0] || "";
    }
  }
  renderComments();
  showToast(`已为 ${data.count} 条高优先级评论生成建议`);
}

async function loadReport() {
  const response = await fetch(`/api/report?itemId=${encodeURIComponent(state.itemId)}&format=md`);
  const text = await response.text();
  if (!response.ok) throw new Error(text || `HTTP ${response.status}`);
  el.reportBox.textContent = text;
  showToast("运营报告已生成");
}

async function copyReport() {
  const text = el.reportBox.textContent || "";
  if (!text || text.includes("点击“生成报告”")) {
    showToast("先生成报告");
    return;
  }
  await navigator.clipboard.writeText(text);
  showToast("报告已复制");
}

async function updateStatus(commentId, status, reason) {
  await api(`/api/comments/${encodeURIComponent(commentId)}/status`, {
    method: "POST",
    body: JSON.stringify({ status, reason }),
  });
  showToast(status === "ignored" ? "已忽略" : "已标记处理");
  await loadComments(state.itemId);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function showToast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    el.toast.hidden = true;
  }, 2400);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cssEscape(value) {
  return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
