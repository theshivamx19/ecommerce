'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Add storeIds column as JSON type to store an array of store IDs
    // Check if column exists first to avoid duplicate column error
    const tableDescription = await queryInterface.describeTable('Products');
    if (!tableDescription.storeIds) {
      await queryInterface.addColumn('Products', 'storeIds', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: []
      });
    } else {
      console.log('storeIds column already exists, skipping migration');
    }
    

  },

  async down (queryInterface, Sequelize) {
    // Remove the storeIds column
    await queryInterface.removeColumn('Products', 'storeIds');
  }
};
