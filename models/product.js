"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Product extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      Product.belongsTo(models.Flow, { foreignKey: "flowId", as: "flow" });
      Product.hasMany(models.ProductImage, {
        foreignKey: "productId",
        as: "images",
      });
      Product.hasMany(models.ProductVariant, {
        foreignKey: "productId",
        as: "variants",
      });
      Product.hasMany(models.ProductOption, {
        foreignKey: "productId",
        as: "options",
      });
      // Product.belongsTo(models.Market, { foreignKey: "marketId", as: "market" });
    }
  }
  Product.init(
    {
      uniqueReferenceCode: DataTypes.STRING,
      flowId: DataTypes.INTEGER,
      title: DataTypes.STRING,
      description: DataTypes.TEXT("long"),
      productType: DataTypes.STRING,
      vendor: DataTypes.STRING,
      tags: {
        type: DataTypes.JSON,
        defaultValue: [],
      },
      status: DataTypes.ENUM("draft", "published"),
      isEnriched: DataTypes.BOOLEAN,
      enrichmentCompletedAt: DataTypes.DATE,
      createdBy: DataTypes.INTEGER,
      approvedBy: DataTypes.INTEGER,
      approvedAt: DataTypes.DATE,
      // Shopify Integration Fields
      shopifyProductIds: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores Shopify product IDs per storeId: {storeId: shopifyProductId}',
      },
      shopifyHandles: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores Shopify handles per storeId: {storeId: handle}',
      },
      shopifyStatuses: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores Shopify statuses per storeId: {storeId: status}',
      },
      syncStatus: DataTypes.ENUM('pending', 'synced', 'failed', 'not_synced'),
      syncStatuses: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores sync status per storeId: {storeId: syncStatus}',
      },
      syncAttemptedAt: DataTypes.DATE,
      syncCompletedAt: DataTypes.DATE,
      syncError: DataTypes.TEXT,
      syncErrors: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores sync errors per storeId: {storeId: errorMessage}',
      },
      storeId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      storeIds: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
      },
      allImageUrls: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
      },
      shopifyProductIds: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores Shopify product IDs per storeId: {storeId: shopifyProductId}',
      },
      syncStatuses: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores sync status per storeId: {storeId: syncStatus}',
      },
      syncErrors: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores sync errors per storeId: {storeId: errorMessage}',
      },
    },
    {
      sequelize,
      modelName: "Product",
    }
  );
  return Product;
};
