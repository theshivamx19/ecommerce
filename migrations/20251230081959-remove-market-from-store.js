'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.removeColumn('Stores', 'market');
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.addColumn('Stores', 'market', {
      type: Sequelize.STRING,
      allowNull: true
    });
  }
};
