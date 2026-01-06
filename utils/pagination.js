const getPagination = (page, size) => {
  const limit = size ? +size : null;          // null  → no limit
  const offset = page && limit ? (page - 1) * limit : 0;
  return { limit, offset };
};

const getPagingData = (data, page, limit) => {
  const { count: totalItems, rows: items } = data;
  const currentPage = page ? +page : 1;
  const totalPages = Math.ceil(totalItems / limit);
  return { items, totalItems, totalPages, currentPage };
};

module.exports = { getPagination, getPagingData };

