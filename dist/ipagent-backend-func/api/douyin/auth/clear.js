const path = require("node:path");
const douyinAuth = require("../../../douyin-auth");

module.exports = async function clearAuthEntry() {
  const rootDir = path.resolve(__dirname, "../../../");
  const auth = douyinAuth.clearAuth(rootDir);
  return { ok: true, auth: douyinAuth.redactAuth(auth) };
};

