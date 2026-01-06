const { fetchAllShopifyProducts, fetchShopifyProductsWithPagination, fetchShopifyProducts, createShopifyProduct } = require('../../services/Shopify/ShopifyService')
const AppError = require('../../utils/AppError')



const fetchShopifyProductsController = async (req, res, next) => {
    try {
        const { storeId } = req.params
        if (!storeId) {
            throw new AppError("Store id is required", 400)
        }
        const rawProducts = await fetchShopifyProducts(storeId)
        const data = {
            products: rawProducts.edges.map(edge => ({
                id: edge.node.id,
                title: edge.node.title,
                description: edge.node.description,
                handle: edge.node.handle,
                status: edge.node.status,
                vendor: edge.node.vendor,
                productType: edge.node.productType,
                tags: edge.node.tags,
                createdAt: edge.node.createdAt,
                updatedAt: edge.node.updatedAt,
                priceRange: {
                    min: parseFloat(edge.node.priceRangeV2.minVariantPrice.amount),
                    max: parseFloat(edge.node.priceRangeV2.maxVariantPrice.amount),
                    currency: edge.node.priceRangeV2.minVariantPrice.currencyCode
                },
                variants: edge.node.variants.edges.map(v => ({
                    id: v.node.id,
                    title: v.node.title,
                    sku: v.node.sku,
                    price: parseFloat(v.node.price),
                    compareAtPrice: v.node.compareAtPrice ? parseFloat(v.node.compareAtPrice) : null,
                    inventoryQuantity: v.node.inventoryQuantity,
                    inventoryItem: v.node.inventoryItem,
                    availableForSale: v.node.availableForSale
                })),
                images: edge.node.images.edges.map(img => ({
                    id: img.node.id,
                    url: img.node.url,
                    altText: img.node.altText,
                    width: img.node.width,
                    height: img.node.height
                })),
                featuredImage: edge.node.featuredImage
            })),
            pagination: {
                hasNextPage: rawProducts.pageInfo.hasNextPage,
                hasPreviousPage: rawProducts.pageInfo.hasPreviousPage,
                startCursor: rawProducts.pageInfo.startCursor,
                endCursor: rawProducts.pageInfo.endCursor
            }
        };
        return res.status(200).json({
            success: true,
            message: `Shopify products: ${data?.products?.length}`,
            products: data?.products,
            pageInfo: data?.pagination
        })
    } catch (error) {
        return next(error)
    }
}

const createShopifyProductController = async (req, res, next) => {
    try {
        const { storeId } = req.params
        // const { product } = req.body
        if (!storeId) {
            throw new AppError("Store id is required", 400)
        }
        const productData = {
            title: 'New Awesome Product',
            descriptionHtml: '<p>Amazing description!</p>',
            vendor: 'My Brand',
            productType: 'Electronics',
            tags: ['new', 'sale'],
            variants: [
                { price: '29.99', sku: 'PROD-001' },
                { price: '39.99', sku: 'PROD-002' }
            ],
            images: [
                { src: 'https://example.com/product.jpg', altText: 'Main product image' }
            ]
        };
        const rawProduct = await createShopifyProduct(storeId, productData)
        return res.status(200).json({
            success: true,
            message: "Shopify product created successfully",
            product: rawProduct
        })
    } catch (error) {
        return next(error)
    }
}









// const fetchShopifyProductsController = async (req, res, next) => {
//     const { storeId } = req.params
//     const { search } = req.query;
//     // GET /api/products?storeId=1&search=status:ACTIVE OR status:DRAFT
//     try {
//         if (!storeId) {
//             throw new AppError("Store id is required", 400)
//         }
//         const rawProducts = await fetchAllShopifyProducts(storeId, search)
//         const data = {
//             products: rawProducts.edges.map(edge => ({
//                 id: edge.node.id,
//                 title: edge.node.title,
//                 description: edge.node.description,
//                 handle: edge.node.handle,
//                 status: edge.node.status,
//                 vendor: edge.node.vendor,
//                 productType: edge.node.productType,
//                 tags: edge.node.tags,
//                 createdAt: edge.node.createdAt,
//                 updatedAt: edge.node.updatedAt,
//                 priceRange: {
//                     min: parseFloat(edge.node.priceRangeV2.minVariantPrice.amount),
//                     max: parseFloat(edge.node.priceRangeV2.maxVariantPrice.amount),
//                     currency: edge.node.priceRangeV2.minVariantPrice.currencyCode
//                 },
//                 variants: edge.node.variants.edges.map(v => ({
//                     id: v.node.id,
//                     title: v.node.title,
//                     sku: v.node.sku,
//                     price: parseFloat(v.node.price),
//                     compareAtPrice: v.node.compareAtPrice ? parseFloat(v.node.compareAtPrice) : null,
//                     inventoryQuantity: v.node.inventoryQuantity,
//                     inventoryItem: v.node.inventoryItem,
//                     availableForSale: v.node.availableForSale
//                 })),
//                 images: edge.node.images.edges.map(img => ({
//                     id: img.node.id,
//                     url: img.node.url,
//                     altText: img.node.altText,
//                     width: img.node.width,
//                     height: img.node.height
//                 })),
//                 featuredImage: edge.node.featuredImage
//             })),
//             pagination: {
//                 hasNextPage: rawProducts.pageInfo.hasNextPage,
//                 hasPreviousPage: rawProducts.pageInfo.hasPreviousPage,
//                 startCursor: rawProducts.pageInfo.startCursor,
//                 endCursor: rawProducts.pageInfo.endCursor
//             }
//         };

//         // const items = edges.map(edge => edge.node);
//         return res.status(200).json({
//             success: true,
//             message: `Shopify products: ${data?.products?.length}`,
//             products: data?.products,
//             pageInfo: data?.pagination
//         })
//     } catch (error) {
//         return next(error)
//     }
// }

// const fetchAllShopifyProductsWithPaginationController = async (req, res, next) => {
//     const { storeId } = req.params
//     try {
//         if (!storeId) {
//             throw new AppError("Store id is required", 400)
//         }
//         const rawProducts = await fetchShopifyProductsWithPagination(storeId)
//         const data = {
//             products: rawProducts.edges.map(edge => ({
//                 id: edge.node.id,
//                 title: edge.node.title,
//                 description: edge.node.description,
//                 handle: edge.node.handle,
//                 status: edge.node.status,
//                 vendor: edge.node.vendor,
//                 productType: edge.node.productType,
//                 tags: edge.node.tags,
//                 createdAt: edge.node.createdAt,
//                 updatedAt: edge.node.updatedAt,
//                 priceRange: {
//                     min: parseFloat(edge.node.priceRangeV2.minVariantPrice.amount),
//                     max: parseFloat(edge.node.priceRangeV2.maxVariantPrice.amount),
//                     currency: edge.node.priceRangeV2.minVariantPrice.currencyCode
//                 },
//                 variants: edge.node.variants.edges.map(v => ({
//                     id: v.node.id,
//                     title: v.node.title,
//                     sku: v.node.sku,
//                     price: parseFloat(v.node.price),
//                     compareAtPrice: v.node.compareAtPrice ? parseFloat(v.node.compareAtPrice) : null,
//                     inventoryQuantity: v.node.inventoryQuantity,
//                     inventoryItem: v.node.inventoryItem,
//                     availableForSale: v.node.availableForSale
//                 })),
//                 images: edge.node.images.edges.map(img => ({
//                     id: img.node.id,
//                     url: img.node.url,
//                     altText: img.node.altText
//                 })),
//                 featuredImage: edge.node.featuredImage ? {
//                     url: edge.node.featuredImage.url,
//                     altText: edge.node.featuredImage.altText
//                 } : null
//             })),
//             pagination: {
//                 hasNextPage: rawProducts.pageInfo.hasNextPage,
//                 hasPreviousPage: rawProducts.pageInfo.hasPreviousPage,
//                 startCursor: rawProducts.pageInfo.startCursor,
//                 endCursor: rawProducts.pageInfo.endCursor
//             },
//             totalCount: rawProducts.edges.length
//         };
//         return res.status(200).json({
//             success: true,
//             message: `Shopify products: ${rawProducts.length}`,
//             products: data.products,
//             pagination: data.pagination,
//             totalCount: data.totalCount
//         })
//     } catch (error) {
//         return next(error)
//     }
// }


module.exports = {
    // fetchShopifyProductsController,
    // fetchAllShopifyProductsWithPaginationController,
    fetchShopifyProductsController,
    createShopifyProductController
}
