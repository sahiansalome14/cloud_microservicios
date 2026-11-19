import { config } from "../config/env.js";
import { withTransaction } from "../config/database.js";
import { AppError } from "../errors/AppError.js";
import {
  decreaseBookStock,
  findBookByIsbn,
  findBooks,
  findBooksByIdsForUpdate,
} from "../repositories/bookRepository.js";

const parseNonNegativeInteger = (rawValue, parameterName) => {
  const value = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(value) || value < 0) {
    throw new AppError(
      `${parameterName} must be a non-negative integer`,
      400,
      "INVALID_QUERY_PARAMETER"
    );
  }

  return value;
};

export const getBooks = async (req, res) => {
  const requestedLimit = req.query.limit
    ? parseNonNegativeInteger(req.query.limit, "limit")
    : config.api.books.defaultLimit;

  if (requestedLimit === 0 || requestedLimit > config.api.books.maxLimit) {
    throw new AppError(
      `limit must be between 1 and ${config.api.books.maxLimit}`,
      400,
      "INVALID_QUERY_PARAMETER"
    );
  }

  const offset = req.query.offset
    ? parseNonNegativeInteger(req.query.offset, "offset")
    : 0;

  const books = await findBooks({ limit: requestedLimit, offset });
  res.status(200).json(books);
};

export const getBookByIsbn = async (req, res) => {
  const isbn = req.params.isbn?.trim();

  if (!isbn) {
    throw new AppError("ISBN is required", 400, "INVALID_ISBN");
  }

  const book = await findBookByIsbn(isbn);

  if (!book) {
    throw new AppError("Book not found", 404, "BOOK_NOT_FOUND");
  }

  res.status(200).json(book);
};

/**
 * Endpoint interno para comunicación entre microservicios (Orders -> Catalog).
 * Reserva stock de libros de forma atómica y devuelve los precios y detalles calculados.
 */
export const reserveAndQuoteBooks = async (req, res) => {
  const items = req.body?.items;

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError("Items are required for reservation", 400, "INVALID_RESERVATION");
  }

  const result = await withTransaction(async (client) => {
    const bookIds = items.map((item) => item.bookId);
    const books = await findBooksByIdsForUpdate(bookIds, client);

    if (books.length !== items.length) {
      throw new AppError("One or more books are no longer available", 409, "BOOK_UNAVAILABLE");
    }

    const booksById = new Map(books.map((b) => [b.book_id, b]));
    const reservedItems = [];

    for (const item of items) {
      const book = booksById.get(item.bookId);
      if (!book || book.stock < item.quantity) {
        throw new AppError(`Insufficient stock for ${book?.title || item.bookId}`, 409, "INSUFFICIENT_STOCK");
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

  res.status(200).json({ items: result });
};
