'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ProductLocation extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      ProductLocation.belongsTo(models.Product, {
        foreignKey: 'productId',
        as: 'product'
      });
      
      // Add association to ProductVariant if needed
      ProductLocation.belongsTo(models.ProductVariant, {
        foreignKey: 'variantId',
        as: 'variant',
        allowNull: true
      });
    }
  }
  ProductLocation.init({
    productId: DataTypes.INTEGER,
    variantId: DataTypes.INTEGER, // New field for variant tracking
    variantSku: DataTypes.STRING,  // New field for variant SKU
    locationId: DataTypes.STRING,
    locationName: DataTypes.STRING,
    stockQuantity: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'ProductLocation',
  });
  return ProductLocation;
};