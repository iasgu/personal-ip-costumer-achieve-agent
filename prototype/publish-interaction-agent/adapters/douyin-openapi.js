function ensureConfigured(env = process.env) {
  const missing = ["DOUYIN_CLIENT_KEY", "DOUYIN_CLIENT_SECRET", "DOUYIN_REDIRECT_URI", "DOUYIN_ACCESS_TOKEN"].filter(
    (key) => !String(env[key] || "").trim()
  );
  if (missing.length) {
    const error = new Error(
      `抖音 OpenAPI 未配置完整：${missing.join(", ")}。请先准备开放平台应用、OAuth 授权、视频发布权限、评论管理权限。`
    );
    error.statusCode = 501;
    throw error;
  }
}

async function createDraft() {
  ensureConfigured();
  throw Object.assign(new Error("douyin-openapi createDraft adapter is not implemented yet."), { statusCode: 501 });
}

async function submitDraft() {
  ensureConfigured();
  throw Object.assign(new Error("douyin-openapi submitDraft adapter is not implemented yet."), { statusCode: 501 });
}

async function getPublishStatus() {
  ensureConfigured();
  throw Object.assign(new Error("douyin-openapi getPublishStatus adapter is not implemented yet."), { statusCode: 501 });
}

async function listComments() {
  ensureConfigured();
  throw Object.assign(new Error("douyin-openapi listComments adapter is not implemented yet."), { statusCode: 501 });
}

async function replyComment() {
  ensureConfigured();
  throw Object.assign(new Error("douyin-openapi replyComment adapter is not implemented yet."), { statusCode: 501 });
}

module.exports = {
  createDraft,
  submitDraft,
  getPublishStatus,
  listComments,
  replyComment,
};

