const { handleApi } = require("../server-core");

module.exports = async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  const handled = await handleApi(req, res, url.pathname);

  if (!handled) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Rota não encontrada." }));
  }
};
