'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Stores', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      storeName: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      shopifyDomain: {
        type: Sequelize.STRING
      },
      shopifyAccessToken: {
        type: Sequelize.STRING,
        allowNull: false
      },
      market: {
        type: Sequelize.STRING
      },
      isActive: {
        type: Sequelize.BOOLEAN,
      },
      storeCategory: {
        type: Sequelize.STRING
      },
      installedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      }
    });
    await queryInterface.addIndex('Stores', ['storeName']);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Stores');
  }
};