'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('ProductLocations', 'variantId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'ProductVariants',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('ProductLocations', 'variantSku', {
      type: Sequelize.STRING,
      allowNull: true
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('ProductLocations', 'variantId');
    await queryInterface.removeColumn('ProductLocations', 'variantSku');
  }
};