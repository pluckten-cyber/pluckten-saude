const { handleApi } = require("../../server-core");

module.exports = async function handler(req, res) {
  await handleApi(req, res, "/api/admin/session");
};
