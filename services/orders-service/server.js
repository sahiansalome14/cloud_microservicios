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
import orderRoutes from "./routes/orderRoutes.js";

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

app.get("/health", async (req, res) => {
  try {
    await verifyDatabaseConnection();
    res.status(200).json({ status: "ok", service: config.app.serviceName });
  } catch (err) {
    res.status(503).json({ status: "error", error: err.message });
  }
});

app.use(`${config.api.basePath}/orders`, orderRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

let server;

const startServer = async () => {
  await verifyDatabaseConnection();
  server = app.listen(config.app.port, () => {
    logger.info("Orders Service HTTP server started", { port: config.app.port });
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
  logger.error("Orders Service failed to start", { error: error.message });
  process.exit(1);
});
