const path = require("node:path");
const { buildAuthStatus } = require("../../../function-helpers");

module.exports = async function authStatusEntry() {
  return buildAuthStatus({ rootDir: path.resolve(__dirname, "../../../"), env: process.env });
};

