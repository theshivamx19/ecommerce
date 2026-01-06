'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     */
    await queryInterface.addColumn('Products', 'tags', {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: [],
    });
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     */
    await queryInterface.removeColumn('Products', 'tags');
  }
};
