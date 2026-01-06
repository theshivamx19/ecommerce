'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add storeId column to ProductVariants table
    await queryInterface.addColumn('ProductVariants', 'storeId', {
      type: Sequelize.INTEGER,
      allowNull: true, // Allow null initially
      // Note: Not adding foreign key constraint here to avoid reference issues
    });
    // Create index for better performance
    await queryInterface.addIndex('ProductVariants', ['storeId']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('ProductVariants', 'storeId');
  }
};