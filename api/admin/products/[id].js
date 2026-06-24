const { handleApi } = require("../../../server-core");

module.exports = async function handler(req, res) {
  const id = req.query?.id || new URL(req.url, `https://${req.headers.host}`).pathname.split("/").pop();
  await handleApi(req, res, `/api/admin/products/${encodeURIComponent(id)}`);
};
