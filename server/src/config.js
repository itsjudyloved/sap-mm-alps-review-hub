import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(serverRoot, ".env") });
dotenv.config({ path: path.join(serverRoot, "..", ".env") });

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "sap-mm-alps-review-hub-dev-secret",
  databaseUrl: process.env.DATABASE_URL || process.env.POSTGRES_URL || "",
  dbPath:
    process.env.NODE_ENV === "test"
      ? ":memory:"
      : process.env.DB_PATH || path.join(serverRoot, "review_hub.db")
};
