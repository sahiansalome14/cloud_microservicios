import "dotenv/config";

const REQUIRED_VARIABLES = [
  "PORT",
  "DB_HOST",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "AUTH_JWT_SECRET",
];

const missing = REQUIRED_VARIABLES.filter(
  (name) => process.env[name] === undefined || process.env[name].trim() === ""
);

if (missing.length > 0) {
  throw new Error(`[orders-service] Missing required environment variables: ${missing.join(", ")}`);
}

export const config = Object.freeze({
  app: {
    serviceName: process.env.SERVICE_NAME || "orders-service",
    environment: process.env.NODE_ENV || "development",
    port: Number.parseInt(process.env.PORT, 10) || 5003,
  },
  api: {
    basePath: process.env.API_BASE_PATH || "/api/v1",
    corsOrigins: (process.env.CORS_ORIGINS || "*").split(",").map((s) => s.trim()),
    orders: {
      maxDistinctItems: Number.parseInt(process.env.ORDERS_MAX_DISTINCT_ITEMS || "20", 10),
      maxQuantityPerItem: Number.parseInt(process.env.ORDERS_MAX_QUANTITY_PER_ITEM || "10", 10),
    },
  },
  services: {
    catalogUrl: process.env.CATALOG_SERVICE_URL || "http://localhost:5002",
  },
  database: {
    host: process.env.DB_HOST,
    port: Number.parseInt(process.env.DB_PORT || "5432", 10),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    schema: process.env.DB_SCHEMA || "schema_orders",
    ssl: process.env.DB_SSL === "true",
    sslRejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true",
    poolMax: Number.parseInt(process.env.DB_POOL_MAX || "10", 10),
    idleTimeoutMs: Number.parseInt(process.env.DB_IDLE_TIMEOUT_MS || "30000", 10),
    connectionTimeoutMs: Number.parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || "5000", 10),
  },
  auth: {
    jwt: {
      secret: process.env.AUTH_JWT_SECRET,
      algorithm: process.env.AUTH_JWT_ALGORITHM || "HS256",
      issuer: process.env.AUTH_JWT_ISSUER || "bookstore-co",
      audience: process.env.AUTH_JWT_AUDIENCE || "bookstore-clients",
    },
    cookie: {
      name: process.env.AUTH_COOKIE_NAME || "bookstore_session",
    },
  },
});
