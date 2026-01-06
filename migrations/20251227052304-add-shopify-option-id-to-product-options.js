'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    /**
     * Add shopifyOptionId column to ProductOption table
     */
    await queryInterface.addColumn('ProductOptions', 'shopifyOptionId', {
      type: Sequelize.STRING,
      allowNull: true,
      unique: false,
    });
  },

  async down (queryInterface, Sequelize) {
    /**
     * Remove shopifyOptionId column from ProductOption table
     */
    await queryInterface.removeColumn('ProductOptions', 'shopifyOptionId');
  }
};
