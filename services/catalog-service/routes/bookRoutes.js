import express from "express";
import {
  getBookByIsbn,
  getBooks,
  reserveAndQuoteBooks,
} from "../controllers/bookController.js";

const router = express.Router();

router.get("/", getBooks);
router.get("/:isbn", getBookByIsbn);
router.post("/internal/reserve", reserveAndQuoteBooks);

export default router;
