const path = require("node:path");
const douyinAuth = require("../../../douyin-auth");

module.exports = async function manualTokenEntry(params = {}) {
  const rootDir = path.resolve(__dirname, "../../../");
  const auth = douyinAuth.saveAuth(rootDir, {
    accessToken: String(params.accessToken || "").trim(),
    refreshToken: String(params.refreshToken || "").trim(),
    openId: String(params.openId || "").trim(),
    scope: String(params.scope || "").trim(),
  });
  return { ok: true, auth: douyinAuth.redactAuth(auth) };
};

