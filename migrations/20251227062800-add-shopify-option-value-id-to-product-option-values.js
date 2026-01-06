'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add shopifyOptionValueId column to ProductOptionValues table
    await queryInterface.addColumn('ProductOptionValues', 'shopifyOptionValueId', {
      type: Sequelize.STRING,
      allowNull: true,
      unique: false,
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove shopifyOptionValueId column from ProductOptionValues table
    await queryInterface.removeColumn('ProductOptionValues', 'shopifyOptionValueId');
  }
};