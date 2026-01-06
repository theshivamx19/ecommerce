"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ProductOptionValues", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      optionId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "ProductOptions",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      value: {
        type: Sequelize.STRING,
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

    await queryInterface.addIndex("ProductOptionValues", [
      "optionId",
      "position",
    ]);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("ProductOptionValues");
  },
};
