'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Add new fields to Products table for better sync tracking
    const productTable = await queryInterface.describeTable('Products');
    
    if (!productTable.shopifyProductIds) {
      await queryInterface.addColumn('Products', 'shopifyProductIds', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores Shopify product IDs per storeId: {storeId: shopifyProductId}'
      });
    }
    
    if (!productTable.syncStatuses) {
      await queryInterface.addColumn('Products', 'syncStatuses', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores sync status per storeId: {storeId: syncStatus}'
      });
    }
    
    if (!productTable.syncErrors) {
      await queryInterface.addColumn('Products', 'syncErrors', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores sync errors per storeId: {storeId: errorMessage}'
      });
    }
    
    // Add new fields to ProductVariants table for better sync tracking
    const variantTable = await queryInterface.describeTable('ProductVariants');
    
    if (!variantTable.shopifyVariantIds) {
      await queryInterface.addColumn('ProductVariants', 'shopifyVariantIds', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores Shopify variant IDs per storeId: {storeId: shopifyVariantId}'
      });
    }
    
    if (!variantTable.inventoryItemIds) {
      await queryInterface.addColumn('ProductVariants', 'inventoryItemIds', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores inventory item IDs per storeId: {storeId: inventoryItemId}'
      });
    }
    
    if (!variantTable.syncStatuses) {
      await queryInterface.addColumn('ProductVariants', 'syncStatuses', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores sync status per storeId: {storeId: syncStatus}'
      });
    }
  },

  async down (queryInterface, Sequelize) {
    // Remove the added fields
    await queryInterface.removeColumn('Products', 'shopifyProductIds');
    await queryInterface.removeColumn('Products', 'syncStatuses');
    await queryInterface.removeColumn('Products', 'syncErrors');
    
    await queryInterface.removeColumn('ProductVariants', 'shopifyVariantIds');
    await queryInterface.removeColumn('ProductVariants', 'inventoryItemIds');
    await queryInterface.removeColumn('ProductVariants', 'syncStatuses');
  }
};