const path = require("node:path");
const { buildHealthPayload } = require("./function-helpers");

module.exports = async function rootEntry() {
  return buildHealthPayload({ rootDir: __dirname, env: process.env });
};

