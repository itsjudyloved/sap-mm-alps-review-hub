import { createApp } from "./app.js";
import { config } from "./config.js";
import { initializeDb } from "./db.js";

await initializeDb();

createApp().listen(config.port, () => {
  console.log(`SAP MM ALPS Review Hub API running on http://localhost:${config.port}`);
});
