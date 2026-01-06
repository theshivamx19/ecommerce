'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Add additional fields to Products table for comprehensive sync tracking
    const productTable = await queryInterface.describeTable('Products');
    
    if (!productTable.shopifyHandles) {
      await queryInterface.addColumn('Products', 'shopifyHandles', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores Shopify handles per storeId: {storeId: handle}'
      });
    }
    
    if (!productTable.shopifyStatuses) {
      await queryInterface.addColumn('Products', 'shopifyStatuses', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores Shopify statuses per storeId: {storeId: status}'
      });
    }
    
    const variantTable = await queryInterface.describeTable('ProductVariants');
    
    if (!variantTable.shopifyMediaIds) {
      await queryInterface.addColumn('ProductVariants', 'shopifyMediaIds', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores Shopify media IDs per storeId: {storeId: shopifyMediaId}'
      });
    }
    
    const optionTable = await queryInterface.describeTable('ProductOptions');
    
    if (!optionTable.shopifyOptionIds) {
      await queryInterface.addColumn('ProductOptions', 'shopifyOptionIds', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores Shopify option IDs per storeId: {storeId: shopifyOptionId}'
      });
    }
    
    const optionValueTable = await queryInterface.describeTable('ProductOptionValues');
    
    if (!optionValueTable.shopifyOptionValueIds) {
      await queryInterface.addColumn('ProductOptionValues', 'shopifyOptionValueIds', {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: {},
        comment: 'Stores Shopify option value IDs per storeId: {storeId: shopifyOptionValueId}'
      });
    }
  },

  async down (queryInterface, Sequelize) {
    // Remove the added fields
    await queryInterface.removeColumn('Products', 'shopifyHandles');
    await queryInterface.removeColumn('Products', 'shopifyStatuses');
    await queryInterface.removeColumn('ProductVariants', 'shopifyMediaIds');
    await queryInterface.removeColumn('ProductOptions', 'shopifyOptionIds');
    await queryInterface.removeColumn('ProductOptionValues', 'shopifyOptionValueIds');
  }
};