'use strict';
const {
  Model
} = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class VariantMedia extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // Define associations here
      VariantMedia.belongsTo(models.ProductVariant, {
        foreignKey: 'variantId',
        as: 'variant'
      });
      VariantMedia.belongsTo(models.ShopifyMedia, {
        foreignKey: 'shopifyMediaId',
        as: 'shopifyMedia'
      });
    }
  }
  
  VariantMedia.init({
    variantId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'ProductVariants',
        key: 'id'
      }
    },
    shopifyMediaId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'ShopifyMedia',
        key: 'id'
      }
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'VariantMedia',
    timestamps: true,
    indexes: [
      {
        fields: ['variantId'],
        name: 'variantmedia_variant_id'
      },
      {
        fields: ['shopifyMediaId'],
        name: 'variantmedia_shopify_media_id'
      },
      {
        fields: ['variantId', 'shopifyMediaId'],
        unique: true,
        name: 'variantmedia_variant_shopify_unique'
      }
    ]
  });
  
  return VariantMedia;
};