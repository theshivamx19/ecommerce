const db = require("../../models/index.js");
const {getPagination, getPagingData} = require("../../utils/pagination.js");


const getUserById = async(userId) =>{
    return await db.User.findByPk(userId);
}

const getUserByEmail = async(email) =>{
    return await db.User.findOne({where:{email}});
}

const getUserByRole = async(role) =>{
    return await db.User.findAll({where:{role}});
}

// const getAllUsers = async (query = {}) => {
//   const { page, limit } = query;              // page=1, limit=10
//   const { limit: size, offset } = getPagination(page, limit);

//   const options = size ? { limit: size, offset } : {}; // no limit → all rows
//   const data = await db.User.findAndCountAll(options);

//   return limit ? getPagingData(data, page, limit) : data.rows; // raw rows when no pagination
// };

const getAllUsers = async (query = {}) => {
  const { page, limit } = query;
  const { limit: size, offset } = getPagination(page, limit);

  // OPTIMIZATION: If no pagination is needed, use findAll (faster)
  if (!size) {
      return await db.User.findAll();
  }

  // Otherwise, use findAndCountAll for pagination
  const data = await db.User.findAndCountAll({ limit: size, offset });
  return getPagingData(data, page, size);
};


const updateUser = async (userId, data) => {
    return await db.User.update(data, { where: { id: userId } });
}

module.exports = {getUserById, getUserByEmail, getUserByRole, getAllUsers, updateUser}