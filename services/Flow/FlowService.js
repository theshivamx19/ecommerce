const db = require("../../models/index.js");
const AppError = require("../../utils/AppError");

const createFlowService = async (data) => {
    const flow = await db.Flow.create(data);
    if (!flow) {
        throw new AppError("Flow not created", 400);
    }
    return flow;
};

const getAllFlowServices = async () => {
    const flows = await db.Flow.findAll({ where: { isActive: true } });
    if (!flows) {
        throw new AppError("Flows not found", 404);
    }
    const flowsWithRules = flows.map(flow => {
        flow.rules = typeof flow.rules === 'string'
            ? JSON.parse(flow.rules)
            : flow.rules;
        flow.aiPrompts = typeof flow.aiPrompts === 'string'
            ? JSON.parse(flow.aiPrompts)
            : flow.aiPrompts;
        return flow;
    });
    return flowsWithRules;
};

const getFlowDetailsByIdService = async (id) => {
    const flow = await db.Flow.findByPk(id);
    if (!flow) {
        throw new AppError("Flow not found", 404);
    }
    return flow;
};

const updateFlowService = async (id, data) => {
    const flow = await db.Flow.findByPk(id);
    if (!flow) {
        throw new AppError("Flow not found", 404);
    }
    return await db.Flow.update(data, { where: { id } });
};

const deleteFlowService = async (id) => {
    const flow = await db.Flow.findByPk(id);
    if (!flow) {
        throw new AppError("Flow not found", 404);
    }
    return await db.Flow.destroy({ where: { id } });
};

module.exports = {
    createFlowService,
    getAllFlowServices,
    getFlowDetailsByIdService,
    updateFlowService,
    deleteFlowService
};
