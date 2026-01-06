'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if the column already exists
    const table = await queryInterface.describeTable('ProductImages');
    if (!table.variantId) {
      await queryInterface.addColumn('ProductImages', 'variantId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'ProductVariants',
          key: 'id',
        },
        onDelete: 'SET NULL',
      });
    } else {
      console.log("Column 'variantId' already exists in ProductImages, skipping...");
    }
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('ProductImages');
    if (table.variantId) {
      await queryInterface.removeColumn('ProductImages', 'variantId');
    } else {
      console.log("Column 'variantId' does not exist in ProductImages, skipping...");
    }
  }
};
