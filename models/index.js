const sequelize = require("../config/db.js");
const { DataTypes } = require("sequelize");

// 1. Import Model Definitions
const defineUser = require("./userModel.js");
const defineRefreshToken = require('./refreshtoken.js')
const defineProduct = require('./product.js')
const defineImage = require('./productimage.js')
const defineFlow = require('./flow.js')
const defineProductVariant = require('./productVariant.js')
const defineProductOption = require('./productoption.js')
const defineProductOptionValue = require('./productoptionvalue.js')
const defineProductVariantOption = require('./productvariantoption.js')
const defineImageStore = require('./imagestore.js')
const defineStore = require('./store.js')
const defineProductType = require('./producttype.js')
const defineProductLocation = require('./productlocation.js')
const defineShopifyMedia = require('./shopifyMedia.js')
const defineMarket = require('./market.js')

// 2. Initialize Models
const User = defineUser(sequelize, DataTypes);
const RefreshToken = defineRefreshToken(sequelize, DataTypes);
const Product = defineProduct(sequelize, DataTypes);
const ProductImage = defineImage(sequelize, DataTypes);
const Flow = defineFlow(sequelize, DataTypes);
const ProductOption = defineProductOption(sequelize, DataTypes);
const ProductOptionValue = defineProductOptionValue(sequelize, DataTypes);
const ProductVariant = defineProductVariant(sequelize, DataTypes);
const ProductVariantOption = defineProductVariantOption(sequelize, DataTypes);
const ImageStore = defineImageStore(sequelize, DataTypes);
const Store = defineStore(sequelize, DataTypes);
const ProductType = defineProductType(sequelize, DataTypes);
const ProductLocation = defineProductLocation(sequelize, DataTypes);
const ShopifyMedia = defineShopifyMedia(sequelize, DataTypes);
const Market = defineMarket(sequelize, DataTypes);

// 3. Create the db Object
const db = {
  sequelize, // The instance (for raw queries, transaction)
  User,
  RefreshToken,
  Product,
  ProductImage,
  Flow,
  ProductOption,
  ProductOptionValue,
  ProductVariant,
  ProductVariantOption,
  ImageStore,
  Store,
  ProductType,
  ProductLocation,
  ShopifyMedia,
  Market
};

Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

module.exports = db;
