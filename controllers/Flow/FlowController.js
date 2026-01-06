const { createFlowService, getAllFlowServices, getFlowDetailsByIdService, updateFlowService, deleteFlowService } = require('../../services/Flow/FlowService')
const AppError = require('../../utils/AppError')

const createFlowController = async (req, res, next) => {
    try {
        const { name, type, aiPrompts, description, rules } = req.body;
        if (!name || !type || !aiPrompts || !description || !rules) {
            throw new AppError("All fields are required", 400);
        }

        const result = await createFlowService({ name, type, aiPrompts, description, rules });
        return res.status(200).json({
            success: true,
            message: "Flow created successfully",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

const getAllFlowController = async (req, res, next) => {
    try {
        const result = await getAllFlowServices();
        return res.status(200).json({
            success: true,
            message: "Flow fetched successfully",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

const getFlowDetailsByIdController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await getFlowDetailsByIdService(id);
        return res.status(200).json({
            success: true,
            message: "Flow details fetched successfully",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

const updateFlowController = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            throw new AppError("Id is required", 400);
        }
        if (!req.body) {
            throw new AppError("Body is required", 400);
        }
        const result = await updateFlowService(id, req.body);
        return res.status(200).json({
            success: true,
            message: "Flow updated successfully",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

const deleteFlowController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await deleteFlowService(id);
        return res.status(200).json({
            success: true,
            message: "Flow deleted successfully",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createFlowController,
    getAllFlowController,
    getFlowDetailsByIdController,
    updateFlowController,
    deleteFlowController
}
