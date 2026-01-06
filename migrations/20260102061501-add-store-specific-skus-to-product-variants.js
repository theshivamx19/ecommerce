'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Add storeSpecificSKUs column to ProductVariants table
    await queryInterface.addColumn('ProductVariants', 'storeSpecificSKUs', {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: {},
    });
  },

  async down (queryInterface, Sequelize) {
    // Remove storeSpecificSKUs column from ProductVariants table
    await queryInterface.removeColumn('ProductVariants', 'storeSpecificSKUs');
  }
};
