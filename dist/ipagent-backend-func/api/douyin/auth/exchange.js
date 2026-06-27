const path = require("node:path");
const douyinAuth = require("../../../douyin-auth");

module.exports = async function authExchangeEntry(params = {}) {
  return douyinAuth.exchangeAuthTicket(path.resolve(__dirname, "../../../"), {
    ticket: params.ticket || params.code,
    appId: params.appId || process.env.DOUYIN_APP_ID || process.env.DOUYIN_CLIENT_KEY,
    appSecret: params.appSecret || process.env.DOUYIN_APP_SECRET || process.env.DOUYIN_CLIENT_SECRET,
    baseUrl: process.env.DOUYIN_OPENAPI_BASE,
  });
};

