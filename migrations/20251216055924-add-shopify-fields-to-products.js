'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Add Shopify fields to Products table
    await queryInterface.addColumn('Products', 'shopifyProductId', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    
    await queryInterface.addColumn('Products', 'shopifyHandle', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    
    await queryInterface.addColumn('Products', 'shopifyStatus', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Add Shopify field to ProductVariants table
    await queryInterface.addColumn('ProductVariants', 'shopifyVariantId', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down (queryInterface, Sequelize) {
    // Remove Shopify fields from Products table
    await queryInterface.removeColumn('Products', 'shopifyProductId');
    await queryInterface.removeColumn('Products', 'shopifyHandle');
    await queryInterface.removeColumn('Products', 'shopifyStatus');
    
    // Remove Shopify field from ProductVariants table
    await queryInterface.removeColumn('ProductVariants', 'shopifyVariantId');
  }
};
