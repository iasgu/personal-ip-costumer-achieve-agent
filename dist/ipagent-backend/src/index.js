const path = require("node:path");
const { buildHealthPayload, buildAuthStatus } = require("../function-helpers");

module.exports = async function indexEntry() {
  return {
    health: await buildHealthPayload({ rootDir: path.resolve(__dirname, ".."), env: process.env }),
    authStatus: await buildAuthStatus({ rootDir: path.resolve(__dirname, ".."), env: process.env }),
  };
};
