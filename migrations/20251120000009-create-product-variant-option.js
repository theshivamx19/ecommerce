"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ProductVariantOptions", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      variantId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "ProductVariants",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      optionValueId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "ProductOptionValues",
          key: "id",
        },
        onDelete: "CASCADE",
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

    await queryInterface.addIndex("ProductVariantOptions", ["variantId"]);
    await queryInterface.addIndex("ProductVariantOptions", ["optionValueId"]);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("ProductVariantOptions");
  },
};
