import path from "node:path";
import { fileURLToPath } from "node:url";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

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

const grpcAddress = process.env.CATALOG_GRPC_URL || "localhost:50051";

export const catalogClient = new catalogProto.CatalogService(
  grpcAddress,
  grpc.credentials.createInsecure()
);

/**
 * Llama al método gRPC ReserveBooks en catalog-service y devuelve una Promesa.
 */
export const reserveBooksViaGrpc = (items) =>
  new Promise((resolve, reject) => {
    catalogClient.ReserveBooks({ items }, (error, response) => {
      if (error) {
        return reject(error);
      }
      resolve(response.items);
    });
  });
