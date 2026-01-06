'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ImageStores', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      storeId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Stores',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      imageUrl: {
        type: Sequelize.TEXT('long'),
        allowNull: false
      },
      altText: {
        type: Sequelize.STRING
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
    await queryInterface.addIndex('ImageStores', ['storeId']);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('ImageStores');
  }
};