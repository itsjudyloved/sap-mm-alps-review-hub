import os from "node:os";
import path from "node:path";

process.env.DB_PATH ||= path.join(os.tmpdir(), "sap-mm-alps-review-hub.db");

const [{ createApp }, { getDb }] = await Promise.all([
  import("./server/src/app.js"),
  import("./server/src/db.js")
]);

getDb();

const app = createApp();

export default app;
