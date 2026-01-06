"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class ProductVariantOption extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      ProductVariantOption.belongsTo(models.ProductVariant, {
        foreignKey: "variantId",
        as: "variant",
      });
      ProductVariantOption.belongsTo(models.ProductOptionValue, {
        foreignKey: "optionValueId",
        as: "optionValue",
      });
    }
  }
  ProductVariantOption.init(
    {
      variantId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "ProductVariant",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      optionValueId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "ProductOptionValue",
          key: "id",
        },
        onDelete: "CASCADE",
      },
    },
    {
      sequelize,
      modelName: "ProductVariantOption",
      indexes: [{ fields: ["variantId"] }, { fields: ["optionValueId"] }],
      timestamps: false,
    }
  );
  return ProductVariantOption;
};
