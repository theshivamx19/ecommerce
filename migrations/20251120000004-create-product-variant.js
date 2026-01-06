"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ProductVariants", {
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
      sku: {
        type: Sequelize.STRING,
      },
      price: {
        type: Sequelize.DECIMAL,
        allowNull: false
      },
      compareAtPrice: {
        type: Sequelize.DECIMAL,
      },
      stockQuantity: {
        type: Sequelize.INTEGER,
      },
      isDefault: {
        type: Sequelize.BOOLEAN,
      },
      image_url: {
        type: Sequelize.STRING,
        allowNull: true,
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

    await queryInterface.addIndex("ProductVariants", ["productId", "sku"]);
    await queryInterface.addIndex("ProductVariants", ["sku"], { unique: true });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("ProductVariants");
  },
};
