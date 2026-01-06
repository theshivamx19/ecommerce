const { getAllUsers } = require("../../services/User/UserService");

const getAllUsersController = async (req, res, next) => {
    const query = req?.query;
    try {
        const users = await getAllUsers(query);
        res.status(200).json({
            success: true,
            message: "Users fetched successfully",
            data: users
        })
    } catch (error) {
        next(error)
    }
}

module.exports = {
    getAllUsersController
}



