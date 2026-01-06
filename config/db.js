const { Sequelize } = require("sequelize");
const env = process.env.NODE_ENV || "development";
const config = require("./config")[env]; // Import settings from step 3

// Create the Single Instance
const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    dialect: config.dialect,
    logging: false,
  }
);

module.exports = sequelize;
