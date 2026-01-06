const axios = require('axios');
const db = require('../../models/index');
const { getStoreDetails, getAllActiveStores } = require('./ShopifyRepository');
const AppError = require('../../utils/AppError');
const ShopifyGraphqlService = require('./ShopifyGraphqlService');
require('@shopify/shopify-api/adapters/node');
const { GraphqlQueryError } = require('@shopify/shopify-api');
const { shopify, createShopifySession } = require('../../config/shopify')


// const shopify = shopifyApi({
//   apiKey: process.env.SHOPIFY_API_KEY,
//   apiSecretKey: process.env.SHOPIFY_API_SECRET,
//   scopes: ['read_products', 'write_products'],
//   hostName: process.env.SHOPIFY_HOST_NAME.replace(/https?:\/\//, ''),
//   apiVersion: ApiVersion.October25,
// });



async function fetchShopifyProducts(storeId) {
  const store = await getStoreDetails(storeId);
  if (!store) throw new Error('Store not found');

  const shopName = store.storeName?.trim();
  const accessToken = store.shopifyAccessToken;
  if (!shopName || !accessToken) throw new Error('Missing shop or token');

  const shopDomain = shopName.endsWith('.myshopify.com')
    ? shopName
    : `${shopName.replace(/https?:\/\//, '')}.myshopify.com`;

  // const session = new Session({
  //   id: `offline_${shopDomain}`,
  //   shop: shopDomain,
  //   state: 'state',
  //   isOnline: false,
  //   accessToken,
  // });
  const session = createShopifySession(shopDomain, accessToken)
  const client = new shopify.clients.Graphql({ session });
  const query = `
    query GetProducts($first: Int!, $query: String, $sortKey: ProductSortKeys) {
      products(first: $first, query: $query, sortKey: $sortKey) {
        edges {
          node {
            id
            title
            description
            handle
            status
            vendor
            productType
            tags
            createdAt
            updatedAt
            priceRangeV2 {
              minVariantPrice {
                amount
                currencyCode
              }
              maxVariantPrice {
                amount
                currencyCode
              }
            }
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  sku
                  price
                  compareAtPrice
                  availableForSale
                  inventoryItem {
                    id
                    tracked
                  }
                  inventoryQuantity
                }
              }
            }
            images(first: 10) {
              edges {
                node {
                  id
                  url
                  altText
                  width
                  height
                }
              }
            }
            featuredImage {
              url
              altText
            }
          }
          cursor
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
      }
    }
  `;
  const variables = {
    first: 50,
    query: "",
    sortKey: "CREATED_AT",
  };

  try {
    // For Shopify SDK v12+, client.request returns { data, extensions, errors }
    const response = await client.request(query, { variables });

    // Check for GraphQL errors first
    if (response.errors?.length) {
      console.error('GraphQL Errors:', JSON.stringify(response.errors, null, 2));
      throw new Error(`GraphQL Errors: ${JSON.stringify(response.errors)}`);
    }

    const data = response.data;
    if (!data?.products?.edges) {
      console.log('Unexpected response structure:', JSON.stringify(response, null, 2));
      return [];
    }

    return data.products

  } catch (error) {
    if (error instanceof GraphqlQueryError) {
      throw new Error(`Shopify GraphQL error: ${JSON.stringify(error.response?.body || error.message)}`);
    }
    throw error;
  }
}

const createShopifyProduct = async (storeId) => {
  // const store = await getStoreDetails(storeId)
  const stores = await getAllActiveStores();
  if (stores.length <= 0) {
    throw new AppError('Store not found', 404)
  }
  // const shopName = store?.storeName;
  // const accessToken = store?.shopifyAccessToken;

  for (const store of stores) {
    const shopName = store?.storeName;
    const accessToken = store?.shopifyAccessToken;
    if (!shopName || !accessToken) {
      throw new Error('shopDomain and accessToken are required');
    }
    const session = createShopifySession(shopName, accessToken)
    const client = new shopify.clients.Graphql({ session });
    const mutation = `
    mutation productCreate($product: ProductCreateInput!) {
      productCreate(product: $product) {
        product {
          id
          title
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
    const variables = {
      product: {
        title: "Test Product",
        descriptionHtml: "Test Product Description",
        vendor: "Test Vendor",
        status: "ACTIVE", // or DRAFT
      },
    };
    const res = await client.request(mutation, { variables });
    const result = res.data.productCreate;
    if (result.userErrors?.length) {
      throw new Error(JSON.stringify(result.userErrors));
    }
    return result.product;
  }

  //   const session = createShopifySession(shopName, accessToken)
  //   const client = new shopify.clients.Graphql({ session });

  //   const mutation = `
  //   mutation productCreate($product: ProductCreateInput!) {
  //     productCreate(product: $product) {
  //       product {
  //         id
  //         title
  //         status
  //       }
  //       userErrors {
  //         field
  //         message
  //       }
  //     }
  //   }
  // `;

  //   const variables = {
  //     product: {
  //       title: "Test Product",
  //       descriptionHtml: "Test Product Description",
  //       vendor: "Test Vendor",
  //       status: "ACTIVE", // or DRAFT
  //     },
  //   };

  //   const res = await client.request(mutation, { variables });
  //   const result = res.data.productCreate;
  //   if (result.userErrors?.length) {
  //     throw new Error(JSON.stringify(result.userErrors));
  //   }
  //   return result.product;
}












// ============ Working with Shopify Graphql API ============ 



// async function fetchAllShopifyProducts(storeId, search) {
//   const store = await getStoreDetails(storeId)
//   if (!store) {
//     throw new AppError('Store not found', 404)
//   }
//   const shopName = store?.storeName;
//   const accessToken = store?.shopifyAccessToken;

//   if (!shopName || !accessToken) {
//     throw new Error('shopDomain and accessToken are required');
//   }

//   const graphqlQuery = `
//     query getProducts($first: Int!, $query: String, $sortKey: ProductSortKeys) {
//       products(first: $first, query: $query, sortKey: $sortKey) {
//         edges {
//           node {
//             id
//             title
//             description
//             handle
//             status
//             vendor
//             productType
//             tags
//             createdAt
//             updatedAt
//             priceRangeV2 {
//               minVariantPrice {
//                 amount
//                 currencyCode
//               }
//               maxVariantPrice {
//                 amount
//                 currencyCode
//               }
//             }
//             variants(first: 100) {
//               edges {
//                 node {
//                   id
//                   title
//                   sku
//                   price
//                   compareAtPrice
//                   availableForSale
//                   inventoryItem {
//                     id
//                     tracked
//                   }
//                   inventoryQuantity
//                 }
//               }
//             }
//             images(first: 10) {
//               edges {
//                 node {
//                   id
//                   url
//                   altText
//                   width
//                   height
//                 }
//               }
//             }
//             featuredImage {
//               url
//               altText
//             }
//           }
//           cursor
//         }
//         pageInfo {
//           hasNextPage
//           hasPreviousPage
//           startCursor
//           endCursor
//         }
//       }
//     }
//   `;
//   // "status:DRAFT OR status:ARCHIVED",
//   const queryOptions = {
//     first: 50,
//     query: search || "",
//     sortKey: "CREATED_AT",
//   };
//   try {
//     const products = await ShopifyGraphqlService.fetchShopifyProductsGql(shopName, accessToken, graphqlQuery, queryOptions);
//     return products;
//   } catch (error) {
//     if (error.response) {
//       console.error(
//         'Shopify API Error:',
//         error.response.status,
//         JSON.stringify(error.response.data, null, 2),
//       );
//       throw new AppError(
//         `Shopify API Error: ${error.response.status} - ${JSON.stringify(
//           error.response.data,
//         )}`,
//         error.response.status,
//       );
//     } else if (error.request) {
//       console.error('No response received:', error.request);
//       throw new AppError('No response from Shopify API', error.response.status);
//     } else {
//       console.error('Error:', error.message);
//       throw error;
//     }
//   }
// }



/**
 * Fetch all products with cursor-based pagination (supports 2048+ variants per product)
 * @param {Object} config - Configuration object (same as fetchShopifyProducts)
 * @returns {Promise<Array>} Array of all products
 */
// async function fetchShopifyProductsWithPagination(storeId, search) {
//   const store = await getStoreDetails(storeId)
//   if (!store) {
//     throw new AppError('Store not found', 404)
//   }
//   const shopName = store?.storeName;
//   const accessToken = store?.shopifyAccessToken;
//   let allProducts = [];
//   let hasNextPage = true;
//   cursor = null;

//   const graphqlQuery = `
//     query getProducts($first: Int!, $after: String, $query: String, $sortKey: ProductSortKeys) {
//       products(first: $first, after: $after, query: $query, sortKey: $sortKey) {
//         edges {
//           node {
//             id
//             title
//             description
//             handle
//             status
//             vendor
//             productType
//             tags
//             createdAt
//             updatedAt
//             priceRangeV2 {
//               minVariantPrice {
//                 amount
//                 currencyCode
//               }
//               maxVariantPrice {
//                 amount
//                 currencyCode
//               }
//             }
//             variants(first: 100) {
//               edges {
//                 node {
//                   id
//                   title
//                   sku
//                   price
//                   compareAtPrice
//                   availableForSale
//                   inventoryItem {
//                     id
//                     tracked
//                   }
//                   inventoryQuantity
//                 }
//               }
//             }
//             images(first: 10) {
//               edges {
//                 node {
//                   id
//                   url
//                   altText
//                 }
//               }
//             }
//             featuredImage {
//               url
//               altText
//             }
//           }
//           cursor
//         }
//         pageInfo {
//           hasNextPage
//           endCursor
//         }
//       }
//     }
//   `;
//   const queryOptions = {
//     first: 250,
//     after: cursor,
//     query: search,
//     sortKey: "CREATED_AT"
//   }
//   while (hasNextPage) {
//     try {
//       const productsData = await ShopifyGraphqlService.fetchShopifyProductsWithPaginationGql(shopName, accessToken, graphqlQuery, queryOptions);
//       // const products = productsData.edges.map(edge => edge.node);
//       // allProducts = allProducts.concat(products);
//       // hasNextPage = productsData.pageInfo.hasNextPage;
//       // cursor = productsData.pageInfo.endCursor;
//       console.log(`Fetched ${productsData.edges.length} products. Total: ${allProducts.length}`);
//       return productsData
//     } catch (error) {
//       console.error('Error fetching products:', error.message);
//       throw error;
//     }
//   }

//   return allProducts;
// }


// ============ Working with Shopify Graphql API ============ 

/**
 * Fetch a single product by ID
 * @param {Object} config - Configuration object
 * @param {string} config.shopDomain - Your Shopify store domain
 * @param {string} config.accessToken - Your Shopify Admin API access token
 * @param {string} config.productId - Product ID (e.g., 'gid://shopify/Product/123456789')
 * @returns {Promise<Object>} Product data
 */
async function fetchShopifyProductById(config) {
  const { shopDomain, accessToken, productId } = config;

  if (!shopDomain || !accessToken || !productId) {
    throw new Error('shopDomain, accessToken, and productId are required');
  }

  const graphqlQuery = `
    query getProduct($id: ID!) {
      product(id: $id) {
        id
        title
        description
        descriptionHtml
        handle
        status
        vendor
        productType
        tags
        createdAt
        updatedAt
        priceRangeV2 {
          minVariantPrice {
            amount
            currencyCode
          }
          maxVariantPrice {
            amount
            currencyCode
          }
        }
        variants(first: 250) {
          edges {
            node {
              id
              title
              sku
              price
              compareAtPrice
              availableForSale
              inventoryItem {
                id
                tracked
              }
              inventoryQuantity
              selectedOptions {
                name
                value
              }
            }
          }
        }
        images(first: 50) {
          edges {
            node {
              id
              url
              altText
              width
              height
            }
          }
        }
        featuredImage {
          url
          altText
        }
        options {
          id
          name
          values
          position
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      `https://${shopDomain}/admin/api/2025-10/graphql.json`,
      {
        query: graphqlQuery,
        variables: { id: productId }
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.errors) {
      throw new Error(`GraphQL Errors: ${JSON.stringify(response.data.errors)}`);
    }

    return response.data.data.product;
  } catch (error) {
    console.error('Error fetching product:', error.message);
    throw error;
  }
}


// ================================ CREATE PRODUCT AND PUBLISH ================================

// /**
//  * Create a simple product on Shopify using productCreate (Latest Method)
//  * Best for: Simple products without variants or when you need basic product creation
//  * 
//  * @param {Object} config - Configuration object
//  * @param {string} config.shopDomain - Your Shopify store domain
//  * @param {string} config.accessToken - Your Shopify Admin API access token
//  * @param {Object} config.product - Product details
//  * @returns {Promise<Object>} Created product data
//  */
// async function createSimpleProduct(config) {
//   const { shopDomain, accessToken, product } = config;

//   if (!shopDomain || !accessToken || !product) {
//     throw new Error('shopDomain, accessToken, and product are required');
//   }

//   const mutation = `
//     mutation createProduct($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
//       productCreate(product: $product, media: $media) {
//         product {
//           id
//           title
//           handle
//           description
//           status
//           vendor
//           productType
//           tags
//           createdAt
//           variants(first: 10) {
//             nodes {
//               id
//               title
//               sku
//               price
//             }
//           }
//           images(first: 10) {
//             nodes {
//               id
//               url
//               altText
//             }
//           }
//         }
//         userErrors {
//           field
//           message
//         }
//       }
//     }
//   `;

//   const variables = {
//     product: {
//       title: product.title,
//       descriptionHtml: product.description || '',
//       vendor: product.vendor || '',
//       productType: product.productType || '',
//       tags: product.tags || [],
//       status: product.status || 'ACTIVE', // ACTIVE, DRAFT, ARCHIVED
//       productOptions: product.productOptions || []
//     },
//     media: product.media || []
//   };

//   try {
//     const response = await axios.post(
//       `https://${shopDomain}/admin/api/2025-10/graphql.json`,
//       {
//         query: mutation,
//         variables
//       },
//       {
//         headers: {
//           'X-Shopify-Access-Token': accessToken,
//           'Content-Type': 'application/json'
//         }
//       }
//     );

//     if (response.data.errors) {
//       throw new Error(`GraphQL Errors: ${JSON.stringify(response.data.errors)}`);
//     }

//     const { product: createdProduct, userErrors } = response.data.data.productCreate;

//     if (userErrors && userErrors.length > 0) {
//       throw new Error(`User Errors: ${JSON.stringify(userErrors)}`);
//     }

//     return createdProduct;
//   } catch (error) {
//     console.error('Error creating product:', error.message);
//     throw error;
//   }
// }

// /**
//  * Create a complete product with variants using productSet (Recommended Method)
//  * Best for: Products with multiple variants, complex options, inventory management
//  * This is the most powerful and recommended approach for 2025
//  * 
//  * @param {Object} config - Configuration object
//  * @param {string} config.shopDomain - Your Shopify store domain
//  * @param {string} config.accessToken - Your Shopify Admin API access token
//  * @param {Object} config.productSet - Complete product details with variants
//  * @returns {Promise<Object>} Created product data
//  */
// async function createProductWithVariants(config) {
//   const { shopDomain, accessToken, productSet } = config;

//   if (!shopDomain || !accessToken || !productSet) {
//     throw new Error('shopDomain, accessToken, and productSet are required');
//   }

//   const mutation = `
//     mutation createProduct($productSet: ProductSetInput!, $synchronous: Boolean!) {
//       productSet(synchronous: $synchronous, input: $productSet) {
//         product {
//           id
//           title
//           handle
//           description
//           status
//           vendor
//           productType
//           tags
//           options(first: 10) {
//             id
//             name
//             position
//             optionValues {
//               id
//               name
//               hasVariants
//             }
//           }
//           variants(first: 100) {
//             nodes {
//               id
//               title
//               sku
//               price
//               compareAtPrice
//               inventoryQuantity
//               selectedOptions {
//                 name
//                 optionValue {
//                   id
//                   name
//                 }
//               }
//             }
//           }
//           images(first: 10) {
//             nodes {
//               id
//               url
//               altText
//             }
//           }
//         }
//         userErrors {
//           field
//           message
//           code
//         }
//       }
//     }
//   `;

//   const variables = {
//     synchronous: true, // Set to false for large products (async processing)
//     productSet: {
//       title: productSet.title,
//       descriptionHtml: productSet.description || '',
//       vendor: productSet.vendor || '',
//       productType: productSet.productType || '',
//       status: productSet.status || 'ACTIVE',
//       tags: productSet.tags || [],
//       productOptions: productSet.productOptions || [],
//       variants: productSet.variants || []
//     }
//   };

//   try {
//     const response = await axios.post(
//       `https://${shopDomain}/admin/api/2025-10/graphql.json`,
//       {
//         query: mutation,
//         variables
//       },
//       {
//         headers: {
//           'X-Shopify-Access-Token': accessToken,
//           'Content-Type': 'application/json'
//         }
//       }
//     );

//     if (response.data.errors) {
//       throw new Error(`GraphQL Errors: ${JSON.stringify(response.data.errors)}`);
//     }

//     const { product, userErrors } = response.data.data.productSet;

//     if (userErrors && userErrors.length > 0) {
//       throw new Error(`User Errors: ${JSON.stringify(userErrors)}`);
//     }

//     return product;
//   } catch (error) {
//     console.error('Error creating product:', error.message);
//     throw error;
//   }
// }

// /**
//  * Publish a product to sales channels
//  * Products are created unpublished by default
//  * 
//  * @param {Object} config - Configuration object
//  * @param {string} config.shopDomain - Your Shopify store domain
//  * @param {string} config.accessToken - Your Shopify Admin API access token
//  * @param {string} config.productId - Product ID to publish
//  * @returns {Promise<Object>} Result
//  */
// async function publishProduct(config) {
//   const { shopDomain, accessToken, productId } = config;

//   const mutation = `
//     mutation publishProduct($id: ID!) {
//       publishablePublishToCurrentChannel(id: $id) {
//         userErrors {
//           field
//           message
//         }
//       }
//     }
//   `;

//   try {
//     const response = await axios.post(
//       `https://${shopDomain}/admin/api/2025-10/graphql.json`,
//       {
//         query: mutation,
//         variables: { id: productId }
//       },
//       {
//         headers: {
//           'X-Shopify-Access-Token': accessToken,
//           'Content-Type': 'application/json'
//         }
//       }
//     );

//     if (response.data.errors) {
//       throw new Error(`GraphQL Errors: ${JSON.stringify(response.data.errors)}`);
//     }

//     return response.data.data.publishablePublishToCurrentChannel;
//   } catch (error) {
//     console.error('Error publishing product:', error.message);
//     throw error;
//   }
// }

// // Example Usage
// async function main() {
//   const config = {
//     shopDomain: 'your-store.myshopify.com',
//     accessToken: 'shpat_xxxxxxxxxxxxxxxxxxxxxxxx'
//   };

//   try {
//     // Example 1: Create a simple product (no variants)
//     console.log('Creating simple product...');
//     const simpleProduct = await createSimpleProduct({
//       ...config,
//       product: {
//         title: 'Wireless Headphones',
//         description: '<p>High-quality wireless headphones with noise cancellation</p>',
//         vendor: 'AudioTech',
//         productType: 'Electronics',
//         tags: ['audio', 'wireless', 'electronics'],
//         status: 'ACTIVE'
//       }
//     });
//     console.log('Simple Product Created:', simpleProduct.id);

//     // Example 2: Create product with variants (RECOMMENDED)
//     console.log('\nCreating product with variants...');
//     const productWithVariants = await createProductWithVariants({
//       ...config,
//       productSet: {
//         title: 'Premium T-Shirt',
//         description: '<p>Comfortable cotton t-shirt available in multiple sizes and colors</p>',
//         vendor: 'Fashion Brand',
//         productType: 'Apparel',
//         tags: ['clothing', 'tshirt', 'cotton'],
//         status: 'ACTIVE',
//         productOptions: [
//           {
//             name: 'Size',
//             position: 1,
//             values: [
//               { name: 'Small' },
//               { name: 'Medium' },
//               { name: 'Large' }
//             ]
//           },
//           {
//             name: 'Color',
//             position: 2,
//             values: [
//               { name: 'Red' },
//               { name: 'Blue' },
//               { name: 'Green' }
//             ]
//           }
//         ],
//         variants: [
//           {
//             optionValues: [
//               { optionName: 'Size', name: 'Small' },
//               { optionName: 'Color', name: 'Red' }
//             ],
//             price: '19.99',
//             compareAtPrice: '29.99',
//             sku: 'TSHIRT-SM-RED'
//           },
//           {
//             optionValues: [
//               { optionName: 'Size', name: 'Small' },
//               { optionName: 'Color', name: 'Blue' }
//             ],
//             price: '19.99',
//             compareAtPrice: '29.99',
//             sku: 'TSHIRT-SM-BLUE'
//           },
//           {
//             optionValues: [
//               { optionName: 'Size', name: 'Medium' },
//               { optionName: 'Color', name: 'Red' }
//             ],
//             price: '21.99',
//             compareAtPrice: '31.99',
//             sku: 'TSHIRT-MD-RED'
//           }
//           // Add more variant combinations as needed
//         ]
//       }
//     });
//     console.log('Product with Variants Created:', productWithVariants.id);
//     console.log('Total Variants:', productWithVariants.variants.nodes.length);

//     // Example 3: Publish the product
//     console.log('\nPublishing product...');
//     await publishProduct({
//       ...config,
//       productId: productWithVariants.id
//     });
//     console.log('Product published successfully!');

//   } catch (error) {
//     console.error('Failed:', error.message);
//   }
// }







module.exports = {
  // fetchAllShopifyProducts,
  // fetchShopifyProductsWithPagination,
  // fetchShopifyProductById,
  fetchShopifyProducts,
  createShopifyProduct
  // createSimpleProduct,
  // createProductWithVariants,
  // publishProduct
};