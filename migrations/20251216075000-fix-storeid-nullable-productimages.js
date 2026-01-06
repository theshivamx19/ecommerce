'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Drop foreign key first
    await queryInterface.removeConstraint('ProductImages', 'ProductImages_ibfk_2');
    
    // Modify column to allow NULL
    await queryInterface.changeColumn('ProductImages', 'storeId', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    
    // Re-add foreign key
    await queryInterface.addConstraint('ProductImages', {
      fields: ['storeId'],
      type: 'foreign key',
      name: 'ProductImages_storeId_fkey',
      references: {
        table: 'Stores',
        field: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeConstraint('ProductImages', 'ProductImages_storeId_fkey');
    
    await queryInterface.changeColumn('ProductImages', 'storeId', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
    
    await queryInterface.addConstraint('ProductImages', {
      fields: ['storeId'],
      type: 'foreign key',
      name: 'ProductImages_ibfk_2',
      references: {
        table: 'Stores',
        field: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  }
};
