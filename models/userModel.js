"use strict";
const { Model } = require("sequelize");

/**
 * @param {import('sequelize').Sequelize} sequelize
 * @param {import('sequelize').DataTypes} DataTypes
 */
module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */

    /**
     * Helper method for defining associations.
     * @param {Object} models
     */
    static associate(models) {
      
    }
  }
  User.init(
    {
      firstName: DataTypes.STRING,
      lastName: DataTypes.STRING,
      email: DataTypes.STRING,
      password: DataTypes.STRING,
      isActive: DataTypes.BOOLEAN,
      role: {
        type: DataTypes.ENUM("admin", "manager", "member"),
        allowNull: false,
      }
    },
    {
      sequelize,
      modelName: "User",
    }
  );
  return User;
};
