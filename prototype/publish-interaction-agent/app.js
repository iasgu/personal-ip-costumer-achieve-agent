const state = {
  selectedPublishId: "pub_demo",
};

const el = {
  adapterBadge: document.querySelector("#adapterBadge"),
  healthTitle: document.querySelector("#healthTitle"),
  healthText: document.querySelector("#healthText"),
  draftForm: document.querySelector("#draftForm"),
  draftList: document.querySelector("#draftList"),
  commentsList: document.querySelector("#commentsList"),
  jimengForm: document.querySelector("#jimengForm"),
  evaluationList: document.querySelector("#evaluationList"),
  toast: document.querySelector("#toast"),
};

document.querySelector("#refreshDraftsBtn").addEventListener("click", loadDrafts);
document.querySelector("#refreshCommentsBtn").addEventListener("click", loadComments);
document.querySelector("#refreshEvaluationsBtn").addEventListener("click", loadEvaluations);
document.querySelector("#loadDemoBtn").addEventListener("click", fillDemoDraft);
el.draftForm.addEventListener("submit", saveDraft);
el.jimengForm.addEventListener("submit", saveEvaluation);

boot();

async function boot() {
  await Promise.all([loadHealth(), loadDrafts(), loadComments(), loadEvaluations()]);
}

async function loadHealth() {
  const data = await api("/api/health");
  el.adapterBadge.textContent = data.publishAdapter || "mock";
  el.healthTitle.textContent = data.douyinConfigured ? "抖音已配置" : "抖音待授权";
  el.healthText.textContent = data.douyinConfigured
    ? "可切换真实 OpenAPI adapter"
    : "当前使用 mock/local adapter，可先演示闭环";
}

function fillDemoDraft() {
  el.draftForm.videoUrl.value = "/assets/outputs/demo-personal-ip.mp4";
  el.draftForm.coverUrl.value = "/assets/outputs/demo-cover.jpg";
  el.draftForm.title.value = "给一个爆款链接，生成你的真人口播视频";
  el.draftForm.description.value = "今天先测试发布草稿和评论互动模块，生成链路后续再拼接。";
  el.draftForm.hashtags.value = "个人IP,AI获客,短视频";
  showToast("已填入示例草稿");
}

async function saveDraft(event) {
  event.preventDefault();
  const form = new FormData(el.draftForm);
  const payload = Object.fromEntries(form.entries());
  payload.platform = "douyin";
  const data = await api("/api/publish/drafts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  showToast(`草稿已保存：${data.draftId}`);
  el.draftForm.reset();
  await loadDrafts();
}

async function loadDrafts() {
  const data = await api("/api/publish/drafts");
  const drafts = data.drafts || [];
  el.draftList.innerHTML = drafts.length ? drafts.map(renderDraft).join("") : `<div class="empty">还没有发布草稿。</div>`;
  el.draftList.querySelectorAll("[data-submit-draft]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const data = await api(`/api/publish/drafts/${btn.dataset.submitDraft}/submit`, { method: "POST" });
      state.selectedPublishId = data.publishId;
      showToast(`已提交发布：${data.publishId}`);
      await loadDrafts();
      await loadComments();
    });
  });
  el.draftList.querySelectorAll("[data-status-publish]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const data = await api(`/api/publish/${btn.dataset.statusPublish}/status`);
      showToast(`发布状态：${data.status} / ${data.reviewStatus}`);
      await loadDrafts();
    });
  });
}

function renderDraft(draft) {
  const tags = (draft.hashtags || []).map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join("");
  const status = escapeHtml(draft.status || "draft");
  return `
    <div class="item">
      <div class="item-head">
        <div>
          <div class="item-title">${escapeHtml(draft.title || "未命名草稿")}</div>
          <div class="meta">${escapeHtml(draft.draftId)} · ${status}</div>
        </div>
        <span class="badge">${status}</span>
      </div>
      <p class="meta">${escapeHtml(draft.videoUrl || "")}</p>
      <p>${escapeHtml(draft.description || "")}</p>
      <div class="tag-row">${tags}</div>
      <div class="mini-actions">
        <button type="button" data-submit-draft="${escapeHtml(draft.draftId)}">提交发布</button>
      </div>
    </div>
  `;
}

async function loadComments() {
  const data = await api(`/api/comments?publishId=${encodeURIComponent(state.selectedPublishId || "pub_demo")}`);
  const comments = data.comments || [];
  el.commentsList.innerHTML = comments.length ? comments.map(renderComment).join("") : `<div class="empty">暂无评论。</div>`;
  el.commentsList.querySelectorAll("[data-suggest-comment]").forEach((btn) => {
    btn.addEventListener("click", () => generateSuggestion(btn.dataset.suggestComment));
  });
  el.commentsList.querySelectorAll("[data-reply-comment]").forEach((btn) => {
    btn.addEventListener("click", () => sendReply(btn.dataset.replyComment));
  });
}

function renderComment(comment) {
  const replied = comment.replyStatus === "replied";
  return `
    <div class="comment" id="comment-${escapeHtml(comment.commentId)}">
      <div class="comment-head">
        <div>
          <div class="comment-user">${escapeHtml(comment.userName)}</div>
          <div class="meta">${escapeHtml(comment.createdAt || "")} · ${Number(comment.likeCount || 0)} 赞</div>
        </div>
        <span class="badge">${replied ? "已回复" : "待回复"}</span>
      </div>
      <div class="comment-body">${escapeHtml(comment.text)}</div>
      ${replied ? `<div class="suggestion">已回复：${escapeHtml(comment.replyText || "")}</div>` : ""}
      <div class="suggestions" data-suggestions-for="${escapeHtml(comment.commentId)}"></div>
      <div class="reply-box">
        <textarea rows="3" data-reply-text="${escapeHtml(comment.commentId)}" placeholder="选择建议后可编辑，再人工确认回复。">${escapeHtml(comment.replyText || "")}</textarea>
      </div>
      <div class="mini-actions">
        <button type="button" data-suggest-comment="${escapeHtml(comment.commentId)}">生成回复建议</button>
        <button type="button" data-reply-comment="${escapeHtml(comment.commentId)}">确认回复</button>
      </div>
    </div>
  `;
}

async function generateSuggestion(commentId) {
  const commentBox = document.querySelector(`#comment-${cssEscape(commentId)}`);
  const commentText = commentBox?.querySelector(".comment-body")?.textContent || "";
  const data = await api(`/api/comments/${encodeURIComponent(commentId)}/suggestions`, {
    method: "POST",
    body: JSON.stringify({ commentText }),
  });
  const target = document.querySelector(`[data-suggestions-for="${cssEscape(commentId)}"]`);
  target.innerHTML = (data.suggestions || [])
    .map((text) => `<button class="suggestion" type="button" data-use-suggestion="${escapeHtml(commentId)}">${escapeHtml(text)}</button>`)
    .join("");
  target.querySelectorAll("[data-use-suggestion]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelector(`[data-reply-text="${cssEscape(commentId)}"]`).value = btn.textContent.trim();
    });
  });
}

async function sendReply(commentId) {
  const text = document.querySelector(`[data-reply-text="${cssEscape(commentId)}"]`)?.value || "";
  const data = await api(`/api/comments/${encodeURIComponent(commentId)}/reply`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  showToast(`回复已发送：${data.replyId}`);
  await loadComments();
}

async function saveEvaluation(event) {
  event.preventDefault();
  const form = new FormData(el.jimengForm);
  const payload = Object.fromEntries(form.entries());
  const data = await api("/api/jimeng/evaluate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  showToast(`即梦评估已记录：${data.recordId}`);
  el.jimengForm.reset();
  await loadEvaluations();
}

async function loadEvaluations() {
  const data = await api("/api/jimeng/evaluations");
  const records = data.records || [];
  el.evaluationList.innerHTML = records.length
    ? records.map(renderEvaluation).join("")
    : `<div class="empty">还没有即梦评估记录。</div>`;
}

function renderEvaluation(record) {
  const result = record.result || {};
  return `
    <div class="item">
      <div class="item-head">
        <div>
          <div class="item-title">${escapeHtml(record.mode)}</div>
          <div class="meta">${escapeHtml(record.createdAt || "")}</div>
        </div>
        <span class="badge">${escapeHtml(result.fitForPersonalIp || "unknown")}</span>
      </div>
      <p>耗时 ${Number(result.latencySeconds || 0)} 秒 · 成本约 ¥${Number(result.costEstimate || 0).toFixed(2)} · 质量 ${Number(result.qualityScore || 0)}/5</p>
      <p class="meta">${escapeHtml(result.notes || "")}</p>
    </div>
  `;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

function showToast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    el.toast.hidden = true;
  }, 2600);
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

