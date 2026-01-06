'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Market extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      Market.belongsTo(models.Store, {
        foreignKey: 'storeId',
        as: 'store',
      });
    }
  }Market.init({
    storeId: DataTypes.INTEGER,
    country: DataTypes.STRING,
    countryCode: DataTypes.STRING,
    percentage: DataTypes.DECIMAL(5, 2),
    sign: DataTypes.ENUM('POSITIVE', 'NEGATIVE'),
  }, {
    sequelize,
    modelName: 'Market',
  });
  return Market;
};