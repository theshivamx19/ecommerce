'use strict';

const bcrypt = require('bcrypt')

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const hashedPassword = await bcrypt.hash('Admin@123', 10);
    await queryInterface.bulkInsert(
      'Users', // 🔴 make sure this matches your table name
      [
        {
          firstName: 'Admin',
          lastName: 'User',
          email: 'admin@gmail.com',
          password: hashedPassword,
          isActive: true,
          role: 'admin',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      {}
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete(
      'Users',
      {
        email: 'admin@gmail.com',
      },
      {}
    );
  },
};
