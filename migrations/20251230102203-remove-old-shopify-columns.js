'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Remove old individual columns from Products table
    const productTable = await queryInterface.describeTable('Products');
    
    if (productTable.shopifyProductId) {
      await queryInterface.removeColumn('Products', 'shopifyProductId');
    }
    
    if (productTable.shopifyHandle) {
      await queryInterface.removeColumn('Products', 'shopifyHandle');
    }
    
    if (productTable.shopifyStatus) {
      await queryInterface.removeColumn('Products', 'shopifyStatus');
    }
    
    // Remove old individual columns from ProductVariants table
    const variantTable = await queryInterface.describeTable('ProductVariants');
    
    if (variantTable.shopifyVariantId) {
      await queryInterface.removeColumn('ProductVariants', 'shopifyVariantId');
    }
    
    if (variantTable.inventoryItemId) {
      await queryInterface.removeColumn('ProductVariants', 'inventoryItemId');
    }
    
    if (variantTable.shopifyMediaId) {
      await queryInterface.removeColumn('ProductVariants', 'shopifyMediaId');
    }
    
    // Remove old individual columns from ProductOptions table
    const optionTable = await queryInterface.describeTable('ProductOptions');
    
    if (optionTable.shopifyOptionId) {
      await queryInterface.removeColumn('ProductOptions', 'shopifyOptionId');
    }
    
    // Remove old individual columns from ProductOptionValues table
    const optionValueTable = await queryInterface.describeTable('ProductOptionValues');
    
    if (optionValueTable.shopifyOptionValueId) {
      await queryInterface.removeColumn('ProductOptionValues', 'shopifyOptionValueId');
    }
  },

  async down (queryInterface, Sequelize) {
    // Add back the old individual columns (for rollback)
    await queryInterface.addColumn('Products', 'shopifyProductId', {
      type: Sequelize.STRING,
      allowNull: true
    });
    
    await queryInterface.addColumn('Products', 'shopifyHandle', {
      type: Sequelize.STRING,
      allowNull: true
    });
    
    await queryInterface.addColumn('Products', 'shopifyStatus', {
      type: Sequelize.STRING,
      allowNull: true
    });
    
    await queryInterface.addColumn('ProductVariants', 'shopifyVariantId', {
      type: Sequelize.STRING,
      allowNull: true
    });
    
    await queryInterface.addColumn('ProductVariants', 'inventoryItemId', {
      type: Sequelize.STRING,
      allowNull: true
    });
    
    await queryInterface.addColumn('ProductVariants', 'shopifyMediaId', {
      type: Sequelize.STRING,
      allowNull: true
    });
    
    await queryInterface.addColumn('ProductOptions', 'shopifyOptionId', {
      type: Sequelize.STRING,
      allowNull: true
    });
    
    await queryInterface.addColumn('ProductOptionValues', 'shopifyOptionValueId', {
      type: Sequelize.STRING,
      allowNull: true
    });
  }
};