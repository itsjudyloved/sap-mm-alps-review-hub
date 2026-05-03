import { createApp } from "./app.js";
import { config } from "./config.js";
import { getDb } from "./db.js";

getDb();

createApp().listen(config.port, () => {
  console.log(`SAP MM ALPS Review Hub API running on http://localhost:${config.port}`);
});
