'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Products', 'allImageUrls', {
      type: Sequelize.JSON, // Using JSON to store an array of image URLs
      allowNull: true,
      defaultValue: [],
      comment: 'Array of all image URLs for the product'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Products', 'allImageUrls');
  }
};