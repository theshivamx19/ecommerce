'use strict';
const {
  Model
} = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ShopifyMedia extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // Define associations here
      ShopifyMedia.belongsTo(models.Product, { 
        foreignKey: 'productId', 
        as: 'product' 
      });
      ShopifyMedia.belongsTo(models.ProductVariant, { 
        foreignKey: 'variantId', 
        as: 'variant' 
      });
    }
  }
  
  ShopifyMedia.init({
    shopifyMediaId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Products',
        key: 'id'
      }
    },
    variantId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'ProductVariants',
        key: 'id'
      }
    },
    mediaUrl: {
      type: DataTypes.TEXT('long'),
      allowNull: false
    },
    altText: {
      type: DataTypes.STRING,
      allowNull: true
    },
    mediaType: {
      type: DataTypes.STRING,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'ShopifyMedia',
    timestamps: true,
    indexes: [
      {
        fields: ['shopifyMediaId']
      },
      {
        fields: ['productId']
      },
      {
        fields: ['variantId']
      }
    ]
  });
  
  return ShopifyMedia;
};