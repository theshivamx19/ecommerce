'use strict';
const {
    Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
    class Flow extends Model {
        static associate(models) {
            // define association here
            Flow.hasMany(models.Product, { foreignKey: 'flowId', as: 'products' });
        }
    }
    Flow.init({
        name: DataTypes.STRING,
        type: DataTypes.STRING,
        description: DataTypes.TEXT,
        aiPrompts: {
            type: DataTypes.JSON,
            defaultValue: {}
        },
        rules: {
            type: DataTypes.JSON,
            defaultValue: {}
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        }
    }, {
        sequelize,
        modelName: 'Flow',
    });
    return Flow;
};
