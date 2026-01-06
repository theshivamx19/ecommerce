'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Store extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      Store.hasOne(models.Market, { 
        foreignKey: 'storeId',
        as: 'market'
      });
      
    }
  }
  Store.init({
    storeName: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    shopifyDomain: DataTypes.STRING,
    shopifyAccessToken: {
      type: DataTypes.STRING,
      allowNull: false
    },
    storeCode: DataTypes.STRING,
    isActive: DataTypes.BOOLEAN,
    storeCategory: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'Store',
  });
  return Store;
};