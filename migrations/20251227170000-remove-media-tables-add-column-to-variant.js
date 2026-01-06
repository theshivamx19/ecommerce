'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add shopifyMediaId column to ProductVariants table
    await queryInterface.addColumn('ProductVariants', 'shopifyMediaId', {
      type: Sequelize.STRING,
      allowNull: true
    });

    // Remove VariantMedia table
    await queryInterface.dropTable('VariantMedia');

    // Remove ShopifyMedia table
    await queryInterface.dropTable('ShopifyMedia');
  },

  down: async (queryInterface, Sequelize) => {
    // Recreate ShopifyMedia table
    await queryInterface.createTable('ShopifyMedia', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      shopifyMediaId: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      productId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Products',
          key: 'id'
        }
      },
      variantId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'ProductVariants',
          key: 'id'
        }
      },
      mediaUrl: {
        type: Sequelize.TEXT('long'),
        allowNull: false
      },
      altText: {
        type: Sequelize.STRING,
        allowNull: true
      },
      mediaType: {
        type: Sequelize.STRING,
        allowNull: false
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Add index for ShopifyMedia table
    await queryInterface.addIndex('ShopifyMedia', ['shopifyMediaId']);
    await queryInterface.addIndex('ShopifyMedia', ['productId']);
    await queryInterface.addIndex('ShopifyMedia', ['variantId']);

    // Recreate VariantMedia table
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
        }
      },
      shopifyMediaId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'ShopifyMedia',
          key: 'id'
        }
      },
      position: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Add indexes for VariantMedia table
    await queryInterface.addIndex('VariantMedia', ['variantId'], { name: 'variantmedia_variant_id' });
    await queryInterface.addIndex('VariantMedia', ['shopifyMediaId'], { name: 'variantmedia_shopify_media_id' });
    await queryInterface.addIndex('VariantMedia', ['variantId', 'shopifyMediaId'], { unique: true, name: 'variantmedia_variant_shopify_unique' });

    // Remove shopifyMediaId column from ProductVariants table
    await queryInterface.removeColumn('ProductVariants', 'shopifyMediaId');
  }
};