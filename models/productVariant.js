"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class ProductVariant extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      ProductVariant.belongsTo(models.Product, { foreignKey: "productId", as: "product" });
      ProductVariant.hasMany(models.ProductVariantOption, {
        foreignKey: "variantId",
        as: "variantOptions",
      });
      // No association to ShopifyMedia since we're storing shopifyMediaId directly in this table
    }
  }
  ProductVariant.init(
    {
      productId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Product",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      sku: DataTypes.STRING,
      price: DataTypes.DECIMAL,
      compareAtPrice: DataTypes.DECIMAL,
      stockQuantity: DataTypes.INTEGER,
      isDefault: DataTypes.BOOLEAN,
      image_url: {
        type: DataTypes.STRING(),
        allowNull: true,
      },
      storeId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'Store',
          key: 'id',
        },
        onDelete: 'SET NULL',
      },
      // Shopify Integration Fields
      shopifyVariantIds: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores Shopify variant IDs per storeId: {storeId: shopifyVariantId}',
      },
      inventoryItemIds: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores inventory item IDs per storeId: {storeId: inventoryItemId}',
      },
      shopifyMediaIds: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores Shopify media IDs per storeId: {storeId: shopifyMediaId}',
      },
      
      // Multi-store sync tracking fields
      storeSpecificSKUs: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores SKUs per storeId: {storeId: sku}',
      },
      syncStatuses: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores sync status per storeId: {storeId: syncStatus}',
      },
    },
    {
      sequelize,
      modelName: "ProductVariant",
      timestamps: false,
      indexes: [
        {
          fields: ["productId", "sku"],
        },
        {
          fields: ["sku"],
          unique: true,
        },
      ],
    }
  );
  return ProductVariant;
};
