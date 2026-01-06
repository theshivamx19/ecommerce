'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {

    // await queryInterface.addColumn('Flows', 'aiPrompts', {
    //   type: Sequelize.JSON,
    //   defaultValue: {},
    // });
    // await queryInterface.addColumn('Flows', 'rules', {
    //   type: Sequelize.JSON,
    //   defaultValue: {},
    // });
    // await queryInterface.removeColumn('Flows', 'settings');
  },

  async down(queryInterface, Sequelize) {
    // await queryInterface.removeColumn('Flows', 'aiPrompts');
    // await queryInterface.removeColumn('Flows', 'rules');
    // await queryInterface.addColumn('Flows', 'settings', {
    //   type: Sequelize.JSON,
    //   defaultValue: {},
    // });
  }
};
