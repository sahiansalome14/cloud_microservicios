import express from "express";
import cors from "cors";

import { config } from "./config/env.js";
import { AppError } from "./errors/AppError.js";
import {
  closeDatabaseConnection,
  verifyDatabaseConnection,
} from "./config/database.js";
import { logger } from "./config/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { sessionContext } from "./middleware/sessionContext.js";
import authRoutes from "./routes/authRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";

const app = express();

const corsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin || config.api.corsOrigins.includes("*") || config.api.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new AppError("Origin is not allowed by CORS policy", 403, "CORS_ORIGIN_DENIED"));
  },
};

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(sessionContext);
app.use(cors(corsOptions));
app.use(express.json());

// Endpoint de salud para Kubernetes readiness/liveness probe
app.get("/health", async (req, res) => {
  try {
    await verifyDatabaseConnection();
    res.status(200).json({ status: "ok", service: config.app.serviceName });
  } catch (err) {
    res.status(503).json({ status: "error", error: err.message });
  }
});

app.use(`${config.api.basePath}/auth`, authRoutes);
app.use(`${config.api.basePath}/events`, eventRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

let server;

const startServer = async () => {
  await verifyDatabaseConnection();
  server = app.listen(config.app.port, () => {
    logger.info("Auth Service HTTP server started", { port: config.app.port });
  });
};

const shutdown = async (signal) => {
  logger.info("Shutdown requested", { signal });
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await closeDatabaseConnection();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startServer().catch((error) => {
  logger.error("Auth Service failed to start", { error: error.message });
  process.exit(1);
});
