const express = require("express");

const {
  createProductController,
  createBulkProductsController,
  getProductController,
  getProductsController,
  getReviewProductController,
  getReviewProductByIdController,
  getShopifyLocationsController,
  updateReviewProductController,
  updateProductController,
  updateProductVariantImagesController,
  deleteProductController,
  syncProductToShopifyController,
  bulkSyncProductsToShopifyController,
  getSyncedProductController,
  getSyncedProductByIdController,
} = require("../../controllers/Product/ProductController");
const {
  ingestProductController,
} = require("../../controllers/Product/IngestionController");
const auth = require("../../middlewares/auth");
const upload = require("../../middlewares/multerConfig");
const router = express.Router();

router.post(
  "/create",
  auth(["admin", "manager", "member"]),
  upload.array("images", 10),
  createProductController
);

// Route to bulk create products in local DB
router.post(
  "/bulk-create",
  auth(["admin", "manager", "member"]),
  createBulkProductsController
);
// router.post(
//   "/ingest",
//   auth(["admin", "manager", "member"]),
//   upload.array("images", 10),
//   ingestProductController
// );
router.get("/", auth(["admin", "manager", "member"]), getProductsController);

// Route to get products that need review (syncStatus: not_sync)
router.get("/review-products", auth(["admin", "manager", "member"]), getReviewProductController);
// Route to get a specific product that needs review by ID
router.get("/review-products/:id", auth(["admin", "manager", "member"]), getReviewProductByIdController);

// Route to get products that are synced (syncStatus: synced)
router.get("/sync-products", auth(["admin", "manager", "member"]), getSyncedProductController);

// Route to get a specific synced product by ID
router.get("/sync-products/:id", auth(["admin", "manager", "member"]), getSyncedProductByIdController);

// Route to get all active Shopify locations for a store
router.get("/shopify-locations", auth(["admin", "manager", "member"]), getShopifyLocationsController);

// Route to update a product that needs review (syncStatus: not_sync)
router.patch("/review-products/update/:id", auth(["admin", "manager", "member"]), updateReviewProductController);

router.get("/:id", auth(["admin", "manager", "member"]), getProductController);
router.patch(
  "/update/:id",
  auth(["admin", "manager", "member"]),
  updateProductController
);

// Route to update product variant images
router.patch(
  "/update-variant-images/:id",
  auth(["admin", "manager", "member"]),
  updateProductVariantImagesController
);
router.delete(
  "/:id",
  auth(["admin", "manager", "member"]),
  deleteProductController
);

// Route to sync a product to Shopify
router.post(
  "/sync/:id",
  auth(["admin", "manager", "member"]),
  syncProductToShopifyController
);

// Route to bulk sync products to Shopify
router.post(
  "/bulk-sync",
  auth(["admin", "manager", "member"]),
  bulkSyncProductsToShopifyController
);


module.exports = router;
