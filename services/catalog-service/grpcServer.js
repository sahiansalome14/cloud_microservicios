import path from "node:path";
import { fileURLToPath } from "node:url";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

import { withTransaction } from "./config/database.js";
import {
  decreaseBookStock,
  findBooksByIdsForUpdate,
} from "./repositories/bookRepository.js";
import { logger } from "./config/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.join(__dirname, "proto", "catalog.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const catalogProto = grpc.loadPackageDefinition(packageDefinition).catalog;

const reserveBooksImplementation = async (call, callback) => {
  const items = call.request.items;

  if (!Array.isArray(items) || items.length === 0) {
    return callback({
      code: grpc.status.INVALID_ARGUMENT,
      message: "No items provided for reservation",
    });
  }

  try {
    const result = await withTransaction(async (client) => {
      const bookIds = items.map((item) => item.bookId);
      const books = await findBooksByIdsForUpdate(bookIds, client);

      if (books.length !== items.length) {
        throw new Error("One or more books are unavailable");
      }

      const booksById = new Map(books.map((b) => [b.book_id, b]));
      const reservedItems = [];

      for (const item of items) {
        const book = booksById.get(item.bookId);
        if (!book || book.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${book?.title || item.bookId}`);
        }

        await decreaseBookStock({ bookId: item.bookId, quantity: item.quantity }, client);

        reservedItems.push({
          bookId: book.book_id,
          isbn: book.isbn,
          title: book.title,
          author: book.author,
          unitPrice: Number(book.price),
          quantity: item.quantity,
        });
      }

      return reservedItems;
    });

    callback(null, { items: result });
  } catch (error) {
    logger.error("gRPC reserveBooks error", { error: error.message });
    callback({
      code: grpc.status.FAILED_PRECONDITION,
      message: error.message,
    });
  }
};

let grpcServer;

export const startGrpcServer = (port = 50051) => {
  grpcServer = new grpc.Server();
  grpcServer.addService(catalogProto.CatalogService.service, {
    ReserveBooks: reserveBooksImplementation,
  });

  grpcServer.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (err, boundPort) => {
      if (err) {
        logger.error("Failed to bind gRPC server", { error: err.message });
        return;
      }
      logger.info("Catalog gRPC server listening", { port: boundPort });
    }
  );
};

export const stopGrpcServer = () => {
  if (grpcServer) {
    grpcServer.forceShutdown();
  }
};
