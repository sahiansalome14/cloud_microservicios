import "dotenv/config";

const REQUIRED_VARIABLES = [
  "PORT",
  "DB_HOST",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
];

const missing = REQUIRED_VARIABLES.filter(
  (name) => process.env[name] === undefined || process.env[name].trim() === ""
);

if (missing.length > 0) {
  throw new Error(`[catalog-service] Missing required environment variables: ${missing.join(", ")}`);
}

export const config = Object.freeze({
  app: {
    serviceName: process.env.SERVICE_NAME || "catalog-service",
    environment: process.env.NODE_ENV || "development",
    port: Number.parseInt(process.env.PORT, 10) || 5002,
  },
  api: {
    basePath: process.env.API_BASE_PATH || "/api/v1",
    corsOrigins: (process.env.CORS_ORIGINS || "*").split(",").map((s) => s.trim()),
    books: {
      defaultLimit: Number.parseInt(process.env.BOOKS_DEFAULT_LIMIT || "10", 10),
      maxLimit: Number.parseInt(process.env.BOOKS_MAX_LIMIT || "50", 10),
    },
  },
  database: {
    host: process.env.DB_HOST,
    port: Number.parseInt(process.env.DB_PORT || "5432", 10),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    schema: process.env.DB_SCHEMA || "schema_catalog",
    ssl: process.env.DB_SSL === "true",
    sslRejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true",
    poolMax: Number.parseInt(process.env.DB_POOL_MAX || "10", 10),
    idleTimeoutMs: Number.parseInt(process.env.DB_IDLE_TIMEOUT_MS || "30000", 10),
    connectionTimeoutMs: Number.parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || "5000", 10),
  },
});
