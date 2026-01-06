'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.changeColumn('ProductImages', 'storeId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Stores',
        key: 'id'
      },
      onDelete: 'CASCADE',
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.changeColumn('ProductImages', 'storeId', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'Stores',
        key: 'id'
      },
      onDelete: 'CASCADE',
    });
  }
};
