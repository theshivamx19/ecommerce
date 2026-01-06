"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ProductOptions", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      productId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "Products",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      position: {
        type: Sequelize.INTEGER,
      },
      // createdAt: {
      //   allowNull: false,
      //   type: Sequelize.DATE,
      //   defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      // },
      // updatedAt: {
      //   allowNull: false,
      //   type: Sequelize.DATE,
      //   defaultValue: Sequelize.literal(
      //     "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
      //   ),
      // },
    });

    await queryInterface.addIndex("ProductOptions", ["productId", "position"]);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("ProductOptions");
  },
};
