'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ProductImage extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      ProductImage.belongsTo(models.Product, { foreignKey: 'productId', as: 'product' });
    }
  }
  ProductImage.init({
    productId: DataTypes.INTEGER,
    storeId: DataTypes.INTEGER,
    originalUrl: DataTypes.TEXT('long'),
    enhancedUrl: DataTypes.TEXT('long'),
    displayOrder: DataTypes.INTEGER,
    altText: DataTypes.STRING,
    isPrimary: DataTypes.BOOLEAN,
    shopifyMediaId: DataTypes.STRING,
    variantId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'ProductVariant',
        key: 'id',
      },
      onDelete: 'SET NULL',
    }
  }, {
    sequelize,
    modelName: 'ProductImage',
  });
  return ProductImage;
};