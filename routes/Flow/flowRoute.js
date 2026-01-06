const express = require("express");
const router = express.Router();
const {
    createFlowController,
    getAllFlowController,
    getFlowDetailsByIdController,
    updateFlowController,
    deleteFlowController
} = require("../../controllers/Flow/FlowController");
const auth = require('../../middlewares/auth')

router.post("/create", auth(['admin', 'manager', 'member']), createFlowController);
router.get("/all", auth(['admin', 'manager', 'member']), getAllFlowController);
router.get("/:id", auth(['admin', 'manager', 'member']), getFlowDetailsByIdController);
router.put("/:id", auth(['admin', 'manager', 'member']), updateFlowController);
router.delete("/:id", auth(['admin', 'manager', 'member']), deleteFlowController);

module.exports = router;