'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const productTypes = {
      Women: [
        "Bikini", "Boots", "Blazer", "Blouse", "Outfit", "T-shirt", "Vest",
        "Jacket", "Cardigan", "Skirt", "Pullover / Sweater", "Pants", "Shorts",
        "Lingerie", "Sandals", "Heels", "Dress", "Shoes", "Coat"
      ],
      Men: [
        "Boots Men", "Shirt Men", "Jacket Men", "Outfit Men", "Pants Men",
        "Shoes Men", "Sandals Men", "Sweater Men", "Vest Men", "Shorts Men"
      ],
      Accessories: [
        "Hats", "Socks", "Bags", "Scarf", "Sunglass"
      ]
    };

    const seedData = [];

    for (const [category, names] of Object.entries(productTypes)) {
      names.forEach(name => {
        seedData.push({
          name,
          category,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });
    }

    await queryInterface.bulkInsert('ProductTypes', seedData, {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('ProductTypes', null, {});
  }
};
