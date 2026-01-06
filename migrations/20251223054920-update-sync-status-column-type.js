'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    /**
     * Update syncStatus column to use ENUM and add sync tracking fields
     */
    // Change syncStatus column to ENUM type
    await queryInterface.changeColumn('Products', 'syncStatus', {
      type: Sequelize.ENUM('pending', 'synced', 'failed', 'not_synced'),
      allowNull: false,
      defaultValue: 'not_synced'
    });
    
    // Add sync tracking fields
    await queryInterface.addColumn('Products', 'syncAttemptedAt', {
      type: Sequelize.DATE,
      allowNull: true
    });
    
    await queryInterface.addColumn('Products', 'syncCompletedAt', {
      type: Sequelize.DATE,
      allowNull: true
    });
    
    await queryInterface.addColumn('Products', 'syncError', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  },

  async down (queryInterface, Sequelize) {
    /**
     * Revert the changes
     */
    await queryInterface.removeColumn('Products', 'syncError');
    await queryInterface.removeColumn('Products', 'syncCompletedAt');
    await queryInterface.removeColumn('Products', 'syncAttemptedAt');
    
    // Revert syncStatus column back to BOOLEAN
    await queryInterface.changeColumn('Products', 'syncStatus', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
  }
};