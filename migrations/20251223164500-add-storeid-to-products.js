'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add storeId column to Products table
    await queryInterface.addColumn('Products', 'storeId', {
      type: Sequelize.INTEGER,
      allowNull: true, // Allow null initially
      // Note: Not adding foreign key constraint here to avoid reference issues
    });

    // Create index for better performance
    await queryInterface.addIndex('Products', ['storeId']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Products', 'storeId');
  }
};