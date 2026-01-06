'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Markets', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      storeId: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      country: {
        type: Sequelize.STRING
      },
      countryCode: {
        type: Sequelize.STRING
      },
      percentage: {
        type: Sequelize.DECIMAL(5, 2)
      },
      sign: {
        type: Sequelize.ENUM('POSITIVE', 'NEGATIVE')
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Markets');
  }
};