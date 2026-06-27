const fs = require("node:fs");
const path = require("node:path");

function getAuthPath(rootDir) {
  return path.join(rootDir, "data", "douyin-auth.json");
}

function readAuth(rootDir) {
  const authPath = getAuthPath(rootDir);
  try {
    return JSON.parse(fs.readFileSync(authPath, "utf8"));
  } catch {
    return {};
  }
}

function writeAuth(rootDir, auth) {
  const authPath = getAuthPath(rootDir);
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  fs.writeFileSync(authPath, JSON.stringify(auth, null, 2), "utf8");
}

function getAuthSnapshot(rootDir, env = process.env) {
  const stored = readAuth(rootDir);
  const accessToken = String(stored.accessToken || env.DOUYIN_ACCESS_TOKEN || "").trim();
  const refreshToken = String(stored.refreshToken || env.DOUYIN_REFRESH_TOKEN || "").trim();
  const openId = String(stored.openId || env.DOUYIN_OPEN_ID || "").trim();
  const scope = String(stored.scope || env.DOUYIN_SCOPE || "").trim();
  const appId = String(env.DOUYIN_APP_ID || "").trim();
  const appSecret = String(env.DOUYIN_APP_SECRET || "").trim();

  return {
    configured: Boolean(accessToken),
    accessToken,
    refreshToken,
    openId,
    scope,
    appId,
    appSecret,
    expiresIn: Number(stored.expiresIn || 0),
    refreshExpiresIn: Number(stored.refreshExpiresIn || 0),
    updatedAt: stored.updatedAt || "",
    source: stored.accessToken ? "stored" : env.DOUYIN_ACCESS_TOKEN ? "env" : "",
  };
}

function saveAuth(rootDir, auth) {
  const current = readAuth(rootDir);
  const next = {
    ...current,
    ...auth,
    updatedAt: new Date().toISOString(),
  };
  writeAuth(rootDir, next);
  return getAuthSnapshot(rootDir);
}

function clearAuth(rootDir) {
  writeAuth(rootDir, {});
  return getAuthSnapshot(rootDir);
}

async function exchangeAuthTicket(rootDir, { ticket, appId, appSecret, baseUrl } = {}) {
  const code = String(ticket || "").trim();
  const clientKey = String(appId || "").trim();
  const clientSecret = String(appSecret || "").trim();
  const base = String(baseUrl || "https://open.douyin.com").replace(/\/+$/, "");
  if (!code) throw new Error("ticket 不能为空");
  if (!clientKey || !clientSecret) throw new Error("缺少 DOUYIN_APP_ID 或 DOUYIN_APP_SECRET");

  const response = await fetch(`${base}/oauth/access_token/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  const data = payload.data || payload;
  const errorCode = Number(data.error_code || payload.error_code || 0);
  if (!response.ok || errorCode) {
    const message = data.description || payload.message || `OAuth failed: HTTP ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status || 502;
    error.payload = payload;
    throw error;
  }

  const saved = saveAuth(rootDir, {
    accessToken: String(data.access_token || "").trim(),
    refreshToken: String(data.refresh_token || "").trim(),
    openId: String(data.open_id || "").trim(),
    scope: String(data.scope || "").trim(),
    expiresIn: Number(data.expires_in || 0),
    refreshExpiresIn: Number(data.refresh_expires_in || 0),
    tokenPayload: data,
  });

  return {
    ok: true,
    auth: redactAuth(saved),
    raw: payload,
  };
}

async function getClientToken({ appId, appSecret, baseUrl } = {}) {
  const clientKey = String(appId || "").trim();
  const clientSecret = String(appSecret || "").trim();
  const base = String(baseUrl || "https://open.douyin.com").replace(/\/+$/, "");
  if (!clientKey || !clientSecret) throw new Error("缺少 DOUYIN_APP_ID 或 DOUYIN_APP_SECRET");

  const response = await fetch(`${base}/oauth/client_token/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "client_credential",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  const data = payload.data || payload;
  const errorCode = Number(data.error_code || payload.error_code || 0);
  if (!response.ok || errorCode) {
    const message = data.description || payload.message || `client_token failed: HTTP ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status || 502;
    error.payload = payload;
    throw error;
  }
  return {
    clientToken: String(data.access_token || data.client_token || "").trim(),
    expiresIn: Number(data.expires_in || 0),
    raw: payload,
  };
}

async function convertVideoIds({ appId, appSecret, baseUrl, videoIds } = {}) {
  const ids = (Array.isArray(videoIds) ? videoIds : [videoIds])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (!ids.length) throw new Error("videoIds 不能为空");

  const { clientToken } = await getClientToken({ appId, appSecret, baseUrl });
  const response = await fetch(`${String(baseUrl || "https://open.douyin.com").replace(/\/+$/, "")}/api/apps/v1/convert_video_id/video_id_to_open_item_id/`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "access-token": clientToken,
    },
    body: JSON.stringify({
      app_id: String(appId || "").trim(),
      access_key: String(appId || "").trim(),
      video_ids: ids,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `video convert failed: HTTP ${response.status}`);
    error.statusCode = response.status || 502;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function queryVideoData({ rootDir, itemIds, baseUrl, env = process.env } = {}) {
  const auth = getAuthSnapshot(rootDir, env);
  if (!auth.accessToken) throw new Error("缺少 access_token，请先完成抖音授权");
  if (!auth.openId) throw new Error("缺少 open_id，请先重新授权");

  const ids = (Array.isArray(itemIds) ? itemIds : [itemIds])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (!ids.length) throw new Error("itemIds 不能为空");

  const response = await fetch(`${String(baseUrl || "https://open.douyin.com").replace(/\/+$/, "")}/api/apps/v1/video/query/?open_id=${encodeURIComponent(auth.openId)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "access-token": auth.accessToken,
    },
    body: JSON.stringify({
      item_ids: ids,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `video query failed: HTTP ${response.status}`);
    error.statusCode = response.status || 502;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function redactAuth(auth) {
  return {
    configured: Boolean(auth.accessToken),
    openId: auth.openId || "",
    scope: auth.scope || "",
    expiresIn: auth.expiresIn || 0,
    refreshExpiresIn: auth.refreshExpiresIn || 0,
    updatedAt: auth.updatedAt || "",
    source: auth.source || "",
    hasRefreshToken: Boolean(auth.refreshToken),
  };
}

module.exports = {
  getAuthSnapshot,
  saveAuth,
  clearAuth,
  exchangeAuthTicket,
  getClientToken,
  convertVideoIds,
  queryVideoData,
  redactAuth,
};
