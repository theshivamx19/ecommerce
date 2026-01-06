'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('VariantMedia', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      variantId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'ProductVariants',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      shopifyMediaId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'ShopifyMedia',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      position: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
    
    // Add indexes for better performance
    await queryInterface.addIndex('VariantMedia', ['variantId'], { name: 'variantmedia_variant_id' });
    await queryInterface.addIndex('VariantMedia', ['shopifyMediaId'], { name: 'variantmedia_shopify_media_id' });
    await queryInterface.addIndex('VariantMedia', ['variantId', 'shopifyMediaId'], { unique: true, name: 'variantmedia_variant_shopify_unique' });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('VariantMedia');
  }
};