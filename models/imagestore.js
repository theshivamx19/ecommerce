'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ImageStore extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  ImageStore.init({
    storeId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    imageUrl: {
      type: DataTypes.TEXT("long"),
      allowNull: false
    },
    altText: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'ImageStore',
  });
  return ImageStore;
};