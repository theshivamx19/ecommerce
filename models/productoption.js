"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class ProductOption extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      ProductOption.belongsTo(models.Product, { foreignKey: "productId", as: "product" });
      ProductOption.hasMany(models.ProductOptionValue, {
        foreignKey: "optionId",
        as: "values",
      });
    }
  }
  ProductOption.init(
    {
      productId: {
        allowNull: false,
        type: DataTypes.INTEGER,
        references: {
          model: "Product",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      name: {
        allowNull: false,
        type: DataTypes.STRING,
      },
      position: DataTypes.INTEGER,
      shopifyOptionIds: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores Shopify option IDs per storeId: {storeId: shopifyOptionId}',
      },
    },
    {
      sequelize,
      modelName: "ProductOption",
      timestamps: false,
      indexes: [{ fields: ["productId", "position"] }],
    }
  );
  return ProductOption;
};
