"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class ProductOptionValue extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      ProductOptionValue.belongsTo(models.ProductOption, { foreignKey: "optionId", as: "option" });
      ProductOptionValue.hasMany(models.ProductVariantOption, {
        foreignKey: "optionValueId",
        as: "variantOptions",
      });
    }
  }
  ProductOptionValue.init(
    {
      optionId: {
        allowNull: false,
        type: DataTypes.INTEGER,
        references: {
          model: "ProductOption",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      value: DataTypes.STRING,
      position: DataTypes.INTEGER,
      shopifyOptionValueIds: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores Shopify option value IDs per storeId: {storeId: shopifyOptionValueId}',
      },
    },
    {
      sequelize,
      modelName: "ProductOptionValue",
      timestamps: false,
      indexes: [
        {
          fields: ["optionId", "position"],
        },
      ],
    }
  );
  return ProductOptionValue;
};
