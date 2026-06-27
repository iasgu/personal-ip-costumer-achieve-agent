const path = require("node:path");
const { buildHealthPayload } = require("../function-helpers");

module.exports = async function healthEntry() {
  return buildHealthPayload({ rootDir: path.resolve(__dirname, ".."), env: process.env });
};

