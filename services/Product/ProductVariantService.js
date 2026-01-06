const db = require("../../models/index.js");
const { checkAndDeleteIfZeroInventory } = require("./VariantDeletionService.js");
const logger = require("../../utils/logger.js");

const createVariant = async (data) => {
  return await db.ProductVariant.create(data);
};

const createMultipleVariants = async (variantsData) => {
  return await db.ProductVariant.bulkCreate(variantsData);
};

const getVariantsByProductId = async (productId) => {
  return await db.ProductVariant.findAll({ where: { productId } });
};

const getVariantById = async (variantId) => {
  return await db.ProductVariant.findByPk(variantId);
};

const getVariantWithDetails = async (variantId) => {
  return await db.ProductVariant.findByPk(variantId, {
    include: [
      {
        model: db.Product,
        as: "product",
      },
      {
        model: db.ProductVariantOption,
        as: "variantOptions",
        include: [
          {
            model: db.ProductOptionValue,
            as: "optionValue",
          },
        ],
      },
    ],
  });
};

const updateVariant = async (variantId, variantData) => {
  // Check if stockQuantity is being updated to 0
  const shouldCheckDeletion = variantData.stockQuantity !== undefined;
  const newStockQuantity = variantData.stockQuantity;

  // CRITICAL FIX: Fetch variant BEFORE update if we might delete it
  // This prevents "variant not found" errors in the deletion service
  let variantSnapshot = null;
  if (shouldCheckDeletion && newStockQuantity === 0) {
    variantSnapshot = await db.ProductVariant.findByPk(variantId, {
      include: [
        {
          model: db.Product,
          as: "product",
        },
      ],
    });

    if (!variantSnapshot) {
      logger.warn(`Variant ${variantId} not found for deletion check`);
      return [0]; // Return Sequelize update result format
    }
  }

  // Update the variant in database
  const updateResult = await db.ProductVariant.update(variantData, {
    where: { id: variantId },
  });

  // If stock reached 0, trigger deletion using the snapshot
  if (variantSnapshot) {
    logger.info(`Variant ${variantId} stock updated to 0. Triggering auto-deletion.`);

    // Pass the snapshot to avoid re-fetching
    // Non-blocking - won't throw errors to prevent update failures
    checkAndDeleteIfZeroInventory(variantId, newStockQuantity, variantSnapshot)
      .catch(error => {
        logger.error(`Auto-deletion failed for variant ${variantId}:`, error);
      });
  }

  return updateResult;
};

const deleteVariant = async (variantId) => {
  return await db.ProductVariant.destroy({ where: { id: variantId } });
};

// ProductOption related methods
const createOption = async (optionData) => {
  return await db.ProductOption.create(optionData);
};

const getOptionsByProductId = async (productId) => {
  return await db.ProductOption.findAll({
    where: { productId },
    include: [
      {
        model: db.ProductOptionValue,
        as: "values",
      },
    ],
  });
};

const updateOption = async (optionId, optionData) => {
  return await db.ProductOption.update(optionData, { where: { id: optionId } });
};

const deleteOption = async (optionId) => {
  return await db.ProductOption.destroy({ where: { id: optionId } });
};

// ProductOptionValue related methods
const createOptionValue = async (valueData) => {
  return await db.ProductOptionValue.create(valueData);
};

const getOptionValuesByOptionId = async (optionId) => {
  return await db.ProductOptionValue.findAll({ where: { optionId } });
};

const updateOptionValue = async (valueId, valueData) => {
  return await db.ProductOptionValue.update(valueData, {
    where: { id: valueId },
  });
};

const deleteOptionValue = async (valueId) => {
  return await db.ProductOptionValue.destroy({ where: { id: valueId } });
};

module.exports = {
  createVariant,
  createMultipleVariants,
  getVariantsByProductId,
  getVariantById,
  getVariantWithDetails,
  updateVariant,
  deleteVariant,
  createOption,
  getOptionsByProductId,
  updateOption,
  deleteOption,
  createOptionValue,
  getOptionValuesByOptionId,
  updateOptionValue,
  deleteOptionValue,
};
