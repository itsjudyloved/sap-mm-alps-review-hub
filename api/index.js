import app from "../vercelApp.js";

export default function handler(req, res) {
  const rawPath = req.query.path;
  const path = Array.isArray(rawPath) ? rawPath.join("/") : rawPath || "";
  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  url.searchParams.delete("path");
  req.url = `/api/${path}${url.search}`;
  return app(req, res);
}
