"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Products", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      uniqueReferenceCode: {
        type: Sequelize.STRING,
        allowNull: true,
      },
       flowId: {
         type: Sequelize.INTEGER, // Changed from BIGINT to match model
         allowNull: true,
       },
      title: {
        type: Sequelize.STRING,
        allowNull: true, // Changed to match model (no allowNull: false)
      },
      description: {
        type: Sequelize.TEXT("long"),
        allowNull: true, // Changed to match model
      },
      productType: {
        type: Sequelize.STRING,
        allowNull: true, // Changed to match model
      },
      vendor: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      // tags: {
      //   type: Sequelize.JSON,
      //   defaultValue: []
      // },
      status: {
        type: Sequelize.ENUM("draft", "published"),
        allowNull: true, // Added to match model
        defaultValue: "draft",
      },
      isEnriched: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false, // Added sensible default
      },
      enrichmentCompletedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      createdBy: {
        type: Sequelize.INTEGER, // Changed from BIGINT to match model
        allowNull: true,
      },
      approvedBy: {
        type: Sequelize.INTEGER, // Changed from BIGINT to match model
        allowNull: true,
      },
      approvedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal(
          "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
        ), // Added ON UPDATE
      },
    });

    // Add indexes for better query performance
    await queryInterface.addIndex("Products", ["status"], {
      name: "idx_products_status",
    });

    await queryInterface.addIndex("Products", ["uniqueReferenceCode"], {
      name: "idx_products_unique_ref_code",
    });

    await queryInterface.addIndex("Products", ["createdBy"], {
      name: "idx_products_created_by",
    });

    await queryInterface.addIndex("Products", ["isEnriched"], {
      name: "idx_products_is_enriched",
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes first
    await queryInterface.removeIndex("Products", "idx_products_is_enriched");
    await queryInterface.removeIndex("Products", "idx_products_created_by");
    await queryInterface.removeIndex(
      "Products",
      "idx_products_unique_ref_code"
    );
    await queryInterface.removeIndex("Products", "idx_products_status");

    // Drop table
    await queryInterface.dropTable("Products");
  },
};
