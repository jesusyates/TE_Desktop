const { randomUUID } = require("crypto");

function createRequestId() {
  return randomUUID();
}

module.exports = { createRequestId };
