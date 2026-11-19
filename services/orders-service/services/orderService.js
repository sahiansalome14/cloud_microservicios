import { withTransaction } from "../config/database.js";
import { AppError } from "../errors/AppError.js";
import {
  createOrderItem,
  createOrderRecord,
  recalculateOrderTotal,
} from "../repositories/orderRepository.js";
import { reserveBooksViaGrpc } from "../grpcClient.js";

const ORDER_STATUS_PLACED = "PLACED";

export const placeOrder = async ({ customerId, items }) => {
  // 1. Comunicación interna gRPC con Catalog Service (pod-to-pod según arquitectura)
  let reservedItems;
  try {
    reservedItems = await reserveBooksViaGrpc(items);
  } catch (err) {
    throw new AppError(
      err.message || "Failed to reserve items in catalog via gRPC",
      409,
      "CATALOG_GRPC_ERROR"
    );
  }

  // 2. Persistir en schema_orders
  return withTransaction(async (client) => {
    const order = await createOrderRecord(
      { customerId, orderStatus: ORDER_STATUS_PLACED },
      client
    );

    for (const item of reservedItems) {
      await createOrderItem(
        {
          orderId: order.order_id,
          bookId: item.bookId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        },
        client
      );
    }

    const updatedOrder = await recalculateOrderTotal(order.order_id, client);

    const totalQuantity = reservedItems.reduce((acc, curr) => acc + curr.quantity, 0);

    return {
      ...updatedOrder,
      total_quantity: totalQuantity,
    };
  });
};
