const axios = require('axios')
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');

/**
 * Append media to product variants using productVariantAppendMedia mutation
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify Admin API access token
 * @param {string} productId - Shopify product ID
 * @param {Array} variantMedia - Array of objects with variantId and mediaIds
 * @returns {object} - Result with product and updated variants
 */
const appendMediaToVariants = async (shopDomain, accessToken, productId, variantMedia, shouldDeleteOldMedia = false) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  // Validate inputs
  if (!productId || !variantMedia || !Array.isArray(variantMedia) || variantMedia.length === 0) {
    throw new AppError('Invalid inputs for appendMediaToVariants', 400);
  }

  // Validate each variantMedia entry
  for (const entry of variantMedia) {
    if (!entry.variantId || !entry.mediaIds || !Array.isArray(entry.mediaIds) || entry.mediaIds.length === 0) {
      throw new AppError(`Invalid variantMedia entry: ${JSON.stringify(entry)}`, 400);
    }
  }

  try {
    // First, get current product details to identify existing media on variants
    logger.info('Fetching current product details to identify existing media');
    const productDetails = await getProductDetails(shopDomain, accessToken, productId);

    if (!productDetails.success) {
      throw new AppError('Failed to fetch current product details', 500);
    }

    // Create a map of current variant IDs to their existing media IDs
    const currentVariantMediaMap = {};
    if (productDetails.product && productDetails.product.variants && productDetails.product.variants.nodes) {
      productDetails.product.variants.nodes.forEach(variant => {
        if (variant.media && variant.media.edges) {
          currentVariantMediaMap[variant.id] = variant.media.edges.map(edge => edge.node.id);
        } else {
          currentVariantMediaMap[variant.id] = [];
        }
      });
    }

    // Prepare detach inputs for existing media on the variants we're updating
    const detachInputs = [];
    for (const entry of variantMedia) {
      const variantId = entry.variantId;
      const existingMediaIds = currentVariantMediaMap[variantId] || [];

      if (existingMediaIds.length > 0) {
        detachInputs.push({
          variantId: variantId,
          mediaIds: existingMediaIds
        });
      }
    }

    // If there are existing media to detach, do that first
    if (detachInputs.length > 0) {
      logger.info(`Detaching ${detachInputs.length} sets of existing media from variants`);

      await productVariantDetachMedia(shopDomain, accessToken, productId, detachInputs);

      // Optionally delete the old media from the product if no longer needed
      if (shouldDeleteOldMedia) {
        // Collect all media IDs that were detached
        const allDetachedMediaIds = detachInputs.flatMap(input => input.mediaIds);

        if (allDetachedMediaIds.length > 0) {
          logger.info(`Deleting ${allDetachedMediaIds.length} old media from product`);

          // Before deleting, check if any of these media are still used by other variants
          // to avoid accidentally deleting media that other variants still need
          const allProductMedia = [];
          if (productDetails.product && productDetails.product.media && productDetails.product.media.edges) {
            allProductMedia.push(...productDetails.product.media.edges.map(edge => edge.node.id));
          }

          // Only delete media that are no longer associated with any variant
          const mediaToDelete = allDetachedMediaIds.filter(mediaId =>
            !allProductMedia.includes(mediaId) ||
            (allProductMedia.includes(mediaId) &&
              !Object.values(currentVariantMediaMap).some(variantMediaIds =>
                variantMediaIds.includes(mediaId) &&
                !detachInputs.some(detachInput => detachInput.mediaIds.includes(mediaId))
              ))
          );

          if (mediaToDelete.length > 0) {
            await productDeleteMedia(shopDomain, accessToken, productId, mediaToDelete);
          }
        }
      }
    }

    // Now attach new media to variants using productVariantAppendMedia
    const mutation = `
      mutation productVariantAppendMedia($productId: ID!, $variantMedia: [ProductVariantAppendMediaInput!]!) {
        productVariantAppendMedia(productId: $productId, variantMedia: $variantMedia) {
          product {
            id
          }
          productVariants {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // logger.debug('Calling productVariantAppendMedia with:', {
    //   productId,
    //   variantMediaCount: variantMedia.length,
    //   variantMediaSample: variantMedia.slice(0, 2) // Show first 2 entries for debugging
    // });

    const response = await axios.post(
      baseUrl,
      {
        query: mutation,
        variables: {
          productId,
          variantMedia
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    const { data } = response;

    if (data.errors) {
      const errorMessages = data.errors.map(e => e.message).join(', ');
      logger.error('GraphQL errors in appendMediaToVariants:', errorMessages);
      logger.error('Full GraphQL error response:', JSON.stringify(data.errors, null, 2));
      throw new AppError(`GraphQL Error: ${errorMessages}`, 400);
    }

    const { productVariantAppendMedia } = data.data;

    if (productVariantAppendMedia.userErrors && productVariantAppendMedia.userErrors.length > 0) {
      const userErrors = productVariantAppendMedia.userErrors;
      logger.error('User errors in appendMediaToVariants:', userErrors);
      throw new AppError(
        `Shopify Error: ${userErrors.map(e => e.message).join(', ')}`,
        400
      );
    }

    logger.debug('productVariantAppendMedia response:', {
      product: productVariantAppendMedia.product?.id,
      variantsCount: productVariantAppendMedia.productVariants?.length
    });

    return {
      product: productVariantAppendMedia.product,
      productVariants: productVariantAppendMedia.productVariants
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const errorMessage = error.response?.data?.errors
      ? JSON.stringify(error.response.data.errors)
      : error.message;

    logger.error('Error appending media to variants:', {
      message: errorMessage,
      productId,
      variantMedia
    });

    throw new AppError(`Failed to append media to variants: ${errorMessage}`, 500);
  }
};

/**
 * Update variant images using productVariantAppendMedia and productVariantDetachMedia mutations
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify Admin API access token
 * @param {string} productId - Shopify product ID
 * @param {Array} variantImages - Array of objects with variantId and mediaIds to update
 * @returns {object} - Result with product and updated variants
 */
const updateProductOption = async (shopDomain, accessToken, productId, optionId, newName, newPosition = null) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  const mutation = `
    mutation productOptionUpdate($productId: ID!, $option: OptionUpdateInput!) {
      productOptionUpdate(productId: $productId, option: $option) {
        product {
          id
          options {
            id
            name
            position
            optionValues {
              id
              name
              hasVariants
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      baseUrl,
      {
        query: mutation,
        variables: {
          productId: productId,
          option: {
            id: optionId,
            name: newName,
            ...(newPosition !== null && { position: newPosition })
          }
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.errors) {
      const errorMessages = response.data.errors.map(error => error.message).join(', ');
      logger.error('GraphQL errors in updateProductOption:', errorMessages);
      throw new AppError(`GraphQL Error: ${errorMessages}`, 500);
    }

    const data = response.data;
    const { productOptionUpdate } = data.data;

    if (productOptionUpdate.userErrors && productOptionUpdate.userErrors.length > 0) {
      const errorMessages = productOptionUpdate.userErrors.map(error => `${error.field}: ${error.message}`).join(', ');
      logger.error('User errors in updateProductOption:', errorMessages);
      throw new AppError(`Option update failed: ${errorMessages}`, 400);
    }

    if (productOptionUpdate.product) {
      logger.info(`Updated product option ${optionId} to name: ${newName}`);
      return {
        success: true,
        product: productOptionUpdate.product
      };
    }

    return { success: false, message: 'No product returned from option update' };
  } catch (error) {
    logger.error('Error updating product option:', error);
    throw error;
  }
};

// New function using correct Shopify API approach
/**
 * Create media on a Shopify product using the correct API
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify Admin API access token
 * @param {string} productId - Shopify product ID
 * @param {string|Array} imageUrl - Single image URL or array of image URLs
 * @param {Object} metadata - Additional metadata for the media
 * @returns {Object} - Result with media IDs
 */
const createShopifyProductMedia = async (shopDomain, accessToken, productId, imageUrl, metadata = {}) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  // Handle both single URL and array of URLs
  const imageUrls = Array.isArray(imageUrl) ? imageUrl : [imageUrl];

  // Filter out any problematic URLs before processing
  const validImageUrls = imageUrls.filter(url => {
    try {
      // Basic validation of URL format
      new URL(url);

      // Check for common problematic file extensions
      const lowerUrl = url.toLowerCase();

      // Check for known problematic URL patterns
      const isGoogleEncrypted = url.includes('encrypted-tbn') || url.includes('google.com/images');
      const isGoogleProxy = url.includes('proxy') || url.includes('gstatic.com/images');

      // For this specific use case, we'll allow Google encrypted URLs but log them
      // as they might work in some cases but fail in others
      if (isGoogleEncrypted || isGoogleProxy) {
        logger.warn(`Google encrypted/proxy URL detected: ${url}. This may fail processing.`);
        // We'll still allow it through but the caller should handle failures gracefully
        return true;
      }

      return !lowerUrl.includes('.svg') && // SVG files can cause issues
        !lowerUrl.includes('.webm') && // Video formats
        !lowerUrl.includes('.mp4') &&
        !lowerUrl.includes('.avi') &&
        !lowerUrl.includes('.mov') &&
        !lowerUrl.includes('.wmv');
    } catch {
      logger.warn(`Invalid URL format: ${url}`);
      return false;
    }
  });

  if (validImageUrls.length === 0) {
    logger.warn('No valid image URLs provided for media creation');
    return { success: false, message: 'No valid image URLs provided', mediaIds: [], media: [] };
  }

  const mediaInputs = validImageUrls.map(url => ({
    originalSource: url,
    mediaContentType: "IMAGE",
    ...metadata
  }));

  const mutation = `
    mutation ProductCreateMediaFromUrl($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media {
          id
          alt
          mediaContentType
          status
          mediaErrors {
            code
            message
          }
        }
        mediaUserErrors {
          field
          message
          code
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      baseUrl,
      {
        query: mutation,
        variables: {
          productId,
          media: mediaInputs
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.errors) {
      const errorMessages = response.data.errors.map(error => error.message).join(', ');
      logger.error('GraphQL errors in createShopifyProductMedia:', errorMessages);
      throw new AppError(`GraphQL Error: ${errorMessages}`, 500);
    }

    const data = response.data;
    const { productCreateMedia } = data.data;

    if (productCreateMedia.mediaUserErrors && productCreateMedia.mediaUserErrors.length > 0) {
      const errorMessages = productCreateMedia.mediaUserErrors.map(error => `${error.field}: ${error.message} (Code: ${error.code})`).join(', ');
      logger.error('User errors in createShopifyProductMedia:', errorMessages);

      // Log specific error codes that might be ignorable
      productCreateMedia.mediaUserErrors.forEach(error => {
        logger.error(`Media error - Field: ${error.field}, Message: ${error.message}, Code: ${error.code}`);
      });

      // Continue processing even if there are errors for some media
      if (productCreateMedia.media && productCreateMedia.media.length > 0) {
        logger.info(`Created ${productCreateMedia.media.length} media items despite some errors`);

        // Return the successfully created media
        const mediaIds = productCreateMedia.media.map(media => media.id);
        return {
          success: true,
          mediaIds: mediaIds,
          media: productCreateMedia.media,
          errors: productCreateMedia.mediaUserErrors
        };
      }

      throw new AppError(`Media creation failed: ${errorMessages}`, 400);
    }

    if (productCreateMedia.media && productCreateMedia.media.length > 0) {
      logger.info(`Created ${productCreateMedia.media.length} media items`);

      // Log the mapping between source URLs and media IDs for debugging
      productCreateMedia.media.forEach(media => {
        logger.debug(`[media] created - ID: ${media.id}, Status: ${media.status}`);

        // Log any media errors if they exist
        if (media.mediaErrors && media.mediaErrors.length > 0) {
          media.mediaErrors.forEach(error => {
            logger.error(`[media] error for ${media.id}: ${error.code} - ${error.message}`);
          });
        }
      });

      // Return the media IDs
      const mediaIds = productCreateMedia.media.map(media => media.id);

      return {
        success: true,
        mediaIds: mediaIds,
        media: productCreateMedia.media
      };

      return {
        success: true,
        mediaIds: mediaIds,
        media: productCreateMedia.media,
        mediaWithUrls: mediaWithUrls
      };
    }

    return { success: false, message: 'No media returned from creation' };
  } catch (error) {
    logger.error('Error creating Shopify product media:', error);
    throw error;
  }
};

/**
 * Query product media status
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify Admin API access token
 * @param {string} productId - Shopify product ID
 * @returns {Object} - Product media information
 */
const getProductMediaStatus = async (shopDomain, accessToken, productId) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  const query = `
    query CheckProductMediaStatus($productId: ID!) {
      product(id: $productId) {
        id
        title
        media(first: 50) {
          nodes {
            id
            mediaContentType
            status
            preview {
              status
            }
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      baseUrl,
      {
        query: query,
        variables: {
          productId
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.errors) {
      const errorMessages = response.data.errors.map(error => error.message).join(', ');
      logger.error('GraphQL errors in getProductMediaStatus:', errorMessages);
      throw new AppError(`GraphQL Error: ${errorMessages}`, 500);
    }

    const data = response.data;
    const { product } = data.data;

    return {
      success: true,
      media: product.media.nodes
    };
  } catch (error) {
    logger.error('Error getting product media status:', error);
    throw error;
  }
};

/**
 * Wait for media to be ready
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify Admin API access token
 * @param {string} productId - Shopify product ID
 * @param {Array} mediaIds - Array of media IDs to wait for
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Array} - Array of ready media IDs and failed media IDs
 */
const waitForMediaReady = async (shopDomain, accessToken, productId, mediaIds, timeoutMs = 60000) => {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const statusResult = await getProductMediaStatus(shopDomain, accessToken, productId);

      if (statusResult.success && statusResult.media) {
        const readyMediaIds = [];
        const failedMediaIds = [];

        for (const mediaId of mediaIds) {
          const media = statusResult.media.find(m => m.id === mediaId);

          if (!media) {
            // Media not found, could be still processing or failed
            continue;
          }

          if (media.status === "FAILED" || media.preview?.status === "FAILED") {
            logger.error(`Media ${mediaId} failed to process:`, media);
            failedMediaIds.push(mediaId);
          } else if (media.status === "READY" || media.preview?.status === "READY") {
            readyMediaIds.push(mediaId);
          }
        }

        // If all requested media are either ready or failed, return the results
        if (readyMediaIds.length + failedMediaIds.length >= mediaIds.length) {
          logger.info(`Media processing complete: ${readyMediaIds.length} ready, ${failedMediaIds.length} failed`);
          return { readyMediaIds, failedMediaIds };
        }

        logger.debug(`Still waiting for ${mediaIds.length - readyMediaIds.length - failedMediaIds.length} media items...`);
      }
    } catch (error) {
      logger.error('Error checking media status:', error);
    }

    // Wait before checking again
    await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced wait time
  }

  // Timeout reached, return what we have
  const statusResult = await getProductMediaStatus(shopDomain, accessToken, productId);
  const readyMediaIds = [];
  const failedMediaIds = [];

  if (statusResult.success && statusResult.media) {
    for (const mediaId of mediaIds) {
      const media = statusResult.media.find(m => m.id === mediaId);

      if (media) {
        if (media.status === "FAILED" || media.preview?.status === "FAILED") {
          failedMediaIds.push(mediaId);
        } else if (media.status === "READY" || media.preview?.status === "READY") {
          readyMediaIds.push(mediaId);
        }
      }
    }
  }

  logger.warn(`Media wait timeout reached. Ready: ${readyMediaIds.length}, Failed: ${failedMediaIds.length}`);
  return { readyMediaIds, failedMediaIds };
};

/**
 * Attach media to specific variants using the correct API after ensuring media is ready
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify Admin API access token
 * @param {string} productId - Shopify product ID
 * @param {Array} variants - Array of {id, mediaId} objects
 * @returns {Object} - Result of the operation
 */
const attachMediaToVariants = async (shopDomain, accessToken, productId, variants, shouldDeleteOldMedia = false) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  try {
    // First, get current product details to identify existing media on variants
    logger.info('Fetching current product details to identify existing media');
    const productDetails = await getProductDetails(shopDomain, accessToken, productId);

    if (!productDetails.success) {
      throw new AppError('Failed to fetch current product details', 500);
    }

    // Create a map of current variant IDs to their existing media IDs
    const currentVariantMediaMap = {};
    if (productDetails.product && productDetails.product.variants && productDetails.product.variants.nodes) {
      productDetails.product.variants.nodes.forEach(variant => {
        if (variant.media && variant.media.edges) {
          currentVariantMediaMap[variant.id] = variant.media.edges.map(edge => edge.node.id);
        } else {
          currentVariantMediaMap[variant.id] = [];
        }
      });
    }

    // Prepare detach inputs for existing media on the variants we're updating
    const detachInputs = [];
    for (const variant of variants) {
      const variantId = variant.id;
      const existingMediaIds = currentVariantMediaMap[variantId] || [];

      if (existingMediaIds.length > 0) {
        detachInputs.push({
          variantId: variantId,
          mediaIds: existingMediaIds
        });
      }
    }

    // If there are existing media to detach, do that first
    if (detachInputs.length > 0) {
      logger.info(`Detaching ${detachInputs.length} sets of existing media from variants`);

      await productVariantDetachMedia(shopDomain, accessToken, productId, detachInputs);

      // Optionally delete the old media from the product if no longer needed
      if (shouldDeleteOldMedia) {
        // Collect all media IDs that were detached
        const allDetachedMediaIds = detachInputs.flatMap(input => input.mediaIds);

        if (allDetachedMediaIds.length > 0) {
          logger.info(`Deleting ${allDetachedMediaIds.length} old media from product`);

          // Before deleting, check if any of these media are still used by other variants
          // to avoid accidentally deleting media that other variants still need
          const allProductMedia = [];
          if (productDetails.product && productDetails.product.media && productDetails.product.media.edges) {
            allProductMedia.push(...productDetails.product.media.edges.map(edge => edge.node.id));
          }

          // Only delete media that are no longer associated with any variant
          const mediaToDelete = allDetachedMediaIds.filter(mediaId =>
            !allProductMedia.includes(mediaId) ||
            (allProductMedia.includes(mediaId) &&
              !Object.values(currentVariantMediaMap).some(variantMediaIds =>
                variantMediaIds.includes(mediaId) &&
                !detachInputs.some(detachInput => detachInput.mediaIds.includes(mediaId))
              ))
          );

          if (mediaToDelete.length > 0) {
            await productDeleteMedia(shopDomain, accessToken, productId, mediaToDelete);
          }
        }
      }
    }

    // Now attach new media to variants using productVariantsBulkUpdate
    const mutation = `
      mutation AttachReadyMediaToVariants(
        $productId: ID!
        $variants: [ProductVariantsBulkInput!]!
      ) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          product {
            id
          }
          productVariants {
            id
            media(first: 10) {
              nodes {
                id
                mediaContentType
                preview {
                  status
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await axios.post(
      baseUrl,
      {
        query: mutation,
        variables: {
          productId,
          variants
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.errors) {
      const errorMessages = response.data.errors.map(error => error.message).join(', ');
      logger.error('GraphQL errors in attachMediaToVariants:', errorMessages);
      throw new AppError(`GraphQL Error: ${errorMessages}`, 500);
    }

    const data = response.data;
    const { productVariantsBulkUpdate } = data.data;

    if (productVariantsBulkUpdate.userErrors && productVariantsBulkUpdate.userErrors.length > 0) {
      const errorMessages = productVariantsBulkUpdate.userErrors.map(error => `${error.field}: ${error.message}`).join(', ');
      logger.error('User errors in attachMediaToVariants:', errorMessages);
      throw new AppError(`Media attachment failed: ${errorMessages}`, 400);
    }

    logger.info(`Attached media to ${productVariantsBulkUpdate.productVariants?.length || 0} variants`);

    return {
      success: true,
      product: productVariantsBulkUpdate.product,
      variants: productVariantsBulkUpdate.productVariants
    };
  } catch (error) {
    logger.error('Error attaching media to variants:', error);
    throw error;
  }
};

const getProductDetails = async (shopDomain, accessToken, productId) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  const query = `
    query getProduct($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        options {
          id
          name
          position
          optionValues {
            id
            name
            hasVariants
          }
        }
        variants(first: 100) {
          nodes {
            id
            sku
            price
            selectedOptions {
              name
              value
            }
            media(first: 10) {
              edges {
                node {
                  id
                  mediaContentType
                  alt
                  preview {
                    image {
                      url
                    }
                  }
                }
              }
            }
          }
        }
        media(first: 50) {
          edges {
            node {
              id
              mediaContentType
              alt
              preview {
                image {
                  url
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      baseUrl,
      {
        query: query,
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
      const errorMessages = response.data.errors.map(error => error.message).join(', ');
      logger.error('GraphQL errors in getProductDetails:', errorMessages);
      throw new AppError(`GraphQL Error: ${errorMessages}`, 500);
    }

    const data = response.data;
    const product = data.data.product;

    if (product) {
      logger.info(`Fetched product details for: ${product.title}`);
      return {
        success: true,
        product: product
      };
    }

    return { success: false, message: 'Product not found' };
  } catch (error) {
    logger.error('Error fetching product details:', error);
    throw error;
  }
};

/**
 * Detach media from product variants
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify Admin API access token
 * @param {string} productId - Shopify product ID
 * @param {Array} variantMedia - Array of objects with variantId and mediaIds to detach
 * @returns {object} - Result with product and updated variants
 */
const productVariantDetachMedia = async (shopDomain, accessToken, productId, variantMedia) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  // Validate inputs
  if (!productId || !variantMedia || !Array.isArray(variantMedia) || variantMedia.length === 0) {
    logger.warn('Invalid inputs for productVariantDetachMedia');
    return { success: false, message: 'Invalid inputs for productVariantDetachMedia' };
  }

  // Validate each variantMedia entry
  for (const entry of variantMedia) {
    if (!entry.variantId || !entry.mediaIds || !Array.isArray(entry.mediaIds)) {
      logger.error('Invalid variantMedia entry:', entry);
      throw new AppError(`Invalid variantMedia entry: ${JSON.stringify(entry)}`, 400);
    }
  }

  const detachMutation = `
    mutation productVariantDetachMedia($productId: ID!, $variantMedia: [ProductVariantDetachMediaInput!]!) {
      productVariantDetachMedia(productId: $productId, variantMedia: $variantMedia) {
        product {
          id
        }
        productVariants {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      baseUrl,
      {
        query: detachMutation,
        variables: { productId, variantMedia }
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.debug('Calling productVariantDetachMedia with:', {
      productId,
      variantMedia
    });

    if (response.data.errors) {
      const errorMessages = response.data.errors.map(error => error.message).join(', ');
      logger.error('GraphQL errors in productVariantDetachMedia:', errorMessages);
      throw new AppError(`GraphQL Error: ${errorMessages}`, 500);
    }

    const data = response.data;
    const { productVariantDetachMedia } = data.data;

    if (productVariantDetachMedia.userErrors && productVariantDetachMedia.userErrors.length > 0) {
      const userErrors = productVariantDetachMedia.userErrors;
      logger.error('User errors in productVariantDetachMedia:', userErrors);
      throw new AppError(
        `Shopify Error: ${userErrors.map(e => e.message).join(', ')}`,
        400
      );
    }

    logger.debug('productVariantDetachMedia response:', {
      product: productVariantDetachMedia.product?.id,
      variantsCount: productVariantDetachMedia.productVariants?.length
    });

    return {
      success: true,
      product: productVariantDetachMedia.product,
      productVariants: productVariantDetachMedia.productVariants
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const errorMessage = error.response?.data?.errors
      ? JSON.stringify(error.response.data.errors)
      : error.message;

    logger.error('Error detaching media from variants:', {
      message: errorMessage,
      productId,
      variantMedia
    });

    throw new AppError(`Failed to detach media from variants: ${errorMessage}`, 500);
  }
};

/**
 * Delete media from a product
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify Admin API access token
 * @param {string} productId - Shopify product ID
 * @param {Array} mediaIds - Array of media IDs to delete
 * @returns {object} - Result with deleted media IDs and product
 */
const productDeleteMedia = async (shopDomain, accessToken, productId, mediaIds) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  // Validate inputs
  if (!productId || !mediaIds || !Array.isArray(mediaIds) || mediaIds.length === 0) {
    logger.warn('Invalid inputs for productDeleteMedia');
    return { success: false, message: 'Invalid inputs for productDeleteMedia' };
  }

  const deleteMutation = `
    mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
      productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
        deletedMediaIds
        product {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      baseUrl,
      {
        query: deleteMutation,
        variables: { productId, mediaIds }
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.debug('Calling productDeleteMedia with:', {
      productId,
      mediaIds
    });

    if (response.data.errors) {
      const errorMessages = response.data.errors.map(error => error.message).join(', ');
      logger.error('GraphQL errors in productDeleteMedia:', errorMessages);
      throw new AppError(`GraphQL Error: ${errorMessages}`, 500);
    }

    const data = response.data;
    const { productDeleteMedia } = data.data;

    if (productDeleteMedia.userErrors && productDeleteMedia.userErrors.length > 0) {
      const userErrors = productDeleteMedia.userErrors;
      logger.error('User errors in productDeleteMedia:', userErrors);
      throw new AppError(
        `Shopify Error: ${userErrors.map(e => e.message).join(', ')}`,
        400
      );
    }

    logger.debug('productDeleteMedia response:', {
      deletedMediaIds: productDeleteMedia.deletedMediaIds,
      product: productDeleteMedia.product?.id
    });

    return {
      success: true,
      deletedMediaIds: productDeleteMedia.deletedMediaIds,
      product: productDeleteMedia.product
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const errorMessage = error.response?.data?.errors
      ? JSON.stringify(error.response.data.errors)
      : error.message;

    logger.error('Error deleting media from product:', {
      message: errorMessage,
      productId,
      mediaIds
    });

    throw new AppError(`Failed to delete media from product: ${errorMessage}`, 500);
  }
};

const updateVariantImages = async (shopDomain, accessToken, productId, variantImages, shouldDeleteOldMedia = false) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  // Validate inputs
  if (!productId || !variantImages || !Array.isArray(variantImages) || variantImages.length === 0) {
    logger.warn('Invalid inputs for updateVariantImages');
    return { success: false, message: 'Invalid inputs for updateVariantImages' };
  }

  // Validate each variantImage entry
  for (const entry of variantImages) {
    if (!entry.variantId || !entry.mediaIds || !Array.isArray(entry.mediaIds)) {
      logger.error('Invalid variantImage entry:', entry);
      throw new AppError(`Invalid variantImage entry: ${JSON.stringify(entry)}`, 400);
    }
  }

  try {
    // First, get current product details to identify existing media on variants
    logger.info('Fetching current product details to identify existing media');
    const productDetails = await getProductDetails(shopDomain, accessToken, productId);

    if (!productDetails.success) {
      throw new AppError('Failed to fetch current product details', 500);
    }

    // Create a map of current variant IDs to their existing media IDs
    const currentVariantMediaMap = {};
    if (productDetails.product && productDetails.product.variants && productDetails.product.variants.nodes) {
      productDetails.product.variants.nodes.forEach(variant => {
        if (variant.media && variant.media.edges) {
          currentVariantMediaMap[variant.id] = variant.media.edges.map(edge => edge.node.id);
        } else {
          currentVariantMediaMap[variant.id] = [];
        }
      });
    }

    // Prepare detach inputs for existing media on the variants we're updating
    const detachInputs = [];
    for (const entry of variantImages) {
      const variantId = entry.variantId;
      const existingMediaIds = currentVariantMediaMap[variantId] || [];

      if (existingMediaIds.length > 0) {
        detachInputs.push({
          variantId: variantId,
          mediaIds: existingMediaIds
        });
      }
    }

    // If there are existing media to detach, do that first
    if (detachInputs.length > 0) {
      logger.info(`Detaching ${detachInputs.length} sets of existing media from variants`);

      await productVariantDetachMedia(shopDomain, accessToken, productId, detachInputs);

      // Optionally delete the old media from the product if no longer needed
      if (shouldDeleteOldMedia) {
        // Collect all media IDs that were detached
        const allDetachedMediaIds = detachInputs.flatMap(input => input.mediaIds);

        if (allDetachedMediaIds.length > 0) {
          logger.info(`Deleting ${allDetachedMediaIds.length} old media from product`);

          // Before deleting, check if any of these media are still used by other variants
          // to avoid accidentally deleting media that other variants still need
          const allProductMedia = [];
          if (productDetails.product && productDetails.product.media && productDetails.product.media.edges) {
            allProductMedia.push(...productDetails.product.media.edges.map(edge => edge.node.id));
          }

          // Only delete media that are no longer associated with any variant
          const mediaToDelete = allDetachedMediaIds.filter(mediaId =>
            !allProductMedia.includes(mediaId) ||
            (allProductMedia.includes(mediaId) &&
              !Object.values(currentVariantMediaMap).some(variantMediaIds =>
                variantMediaIds.includes(mediaId) &&
                !detachInputs.some(detachInput => detachInput.mediaIds.includes(mediaId))
              ))
          );

          if (mediaToDelete.length > 0) {
            await productDeleteMedia(shopDomain, accessToken, productId, mediaToDelete);
          }
        }
      }
    }

    // Now attach new media to variants using productVariantAppendMedia
    const attachMutation = `
      mutation productVariantAppendMedia($productId: ID!, $variantMedia: [ProductVariantAppendMediaInput!]!) {
        productVariantAppendMedia(productId: $productId, variantMedia: $variantMedia) {
          product {
            id
          }
          productVariants {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const attachInputs = variantImages.map(entry => ({
      variantId: entry.variantId,
      mediaIds: entry.mediaIds
    }));

    // logger.debug('Calling productVariantAppendMedia with:', {
    //   productId,
    //   variantMedia: attachInputs
    // });

    const attachResponse = await axios.post(
      baseUrl,
      {
        query: attachMutation,
        variables: { productId, variantMedia: attachInputs }
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (attachResponse.data.errors) {
      const errorMessages = attachResponse.data.errors.map(error => error.message).join(', ');
      logger.error('GraphQL errors in updateVariantImages:', errorMessages);
      throw new AppError(`GraphQL Error: ${errorMessages}`, 500);
    }

    const attachData = attachResponse.data;
    const { productVariantAppendMedia } = attachData.data;

    if (productVariantAppendMedia.userErrors && productVariantAppendMedia.userErrors.length > 0) {
      const userErrors = productVariantAppendMedia.userErrors;
      logger.error('User errors in updateVariantImages:', userErrors);
      throw new AppError(
        `Shopify Error: ${userErrors.map(e => e.message).join(', ')}`,
        400
      );
    }

    logger.debug('productVariantAppendMedia response:', {
      product: productVariantAppendMedia.product?.id,
      variantsCount: productVariantAppendMedia.productVariants?.length
    });

    return {
      success: true,
      product: productVariantAppendMedia.product,
      productVariants: productVariantAppendMedia.productVariants
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const errorMessage = error.response?.data?.errors
      ? JSON.stringify(error.response.data.errors)
      : error.message;

    logger.error('Error updating variant images:', {
      message: errorMessage,
      productId,
      variantImages
    });

    throw new AppError(`Failed to update variant images: ${errorMessage}`, 500);
  }
};

/**
 * Create variants for a product using productVariantsBulkCreate mutation
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify Admin API access token
 * @param {string} productId - Shopify product ID
 * @param {Array} variants - Array of variant objects
 * @returns {object} - Created variants with Shopify IDs
 */
// Helper function to check existing variants on a product
const checkExistingVariants = async (shopDomain, accessToken, productId) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  const query = `
    query getProductVariants($id: ID!) {
      product(id: $id) {
        id
        title
        variants(first: 50) {
          edges {
            node {
              id
              title
              selectedOptions {
                name
                value
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      baseUrl,
      {
        query,
        variables: { id: productId }
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.errors) {
      logger.error('Error checking existing variants:', response.data.errors);
      return [];
    }

    const product = response.data.data.product;
    const existingVariants = product.variants.edges;

    logger.debug(`Product ${product.id} (${product.title}) has ${existingVariants.length} existing variants:`);

    const existingSignatures = [];
    if (existingVariants.length > 0) {
      existingVariants.forEach((edge, index) => {
        const variant = edge.node;
        // Create signature based on selected options
        // Add null check for selectedOptions
        const optionSignature = variant.selectedOptions && Array.isArray(variant.selectedOptions)
          ? variant.selectedOptions.map(opt => `${opt.name}:${opt.value}`).join(' / ')
          : '';
        logger.debug(`  ${index + 1}. ${variant.title} (${optionSignature})`);
        existingSignatures.push(optionSignature);
      });
    }

    return existingSignatures;

  } catch (error) {
    logger.error('Failed to check existing variants:', error.message);
    return [];
  }
};

const createProductVariants = async (shopDomain, accessToken, productId, variants, locationId, optionNames) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  // // Log incoming data for debugging
  // logger.debug('createProductVariants called with:', {
  //   productId,
  //   variantsCount: variants?.length,
  //   locationId,
  //   optionNames,
  //   // Log the full variants input to check for duplicates
  //   variantsInput: variants
  // });

  const mutation = `
    mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkCreate(productId: $productId, variants: $variants) {
        product {
          id
        }
        productVariants {
          id
          sku
          price
          inventoryItem {
            id
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  // Transform variants to match ProductVariantsBulkInput format
  const bulkVariantsInput = (variants || []).map((variant, variantIndex) => {
    // Handle both options array format and optionValues object format
    let optionValues = [];

    // // Add debug logging to see what we're working with
    // logger.debug(`Processing variant ${variantIndex}:`, JSON.stringify({
    //   hasOptionValues: !!(variant.optionValues && Array.isArray(variant.optionValues)),
    //   optionValuesLength: variant.optionValues?.length,
    //   hasOptions: !!(variant.options && Array.isArray(variant.options)),
    //   optionsLength: variant.options?.length,
    //   options: variant.options,
    //   optionNames: optionNames
    // }, null, 2));

    if (variant.optionValues && Array.isArray(variant.optionValues) && variant.optionValues.length > 0) {
      // Handle optionValues format: [{ optionName: "Leanth", value: "Small" }, ...]
      optionValues = variant.optionValues.map((optionObj, index) => ({
        name: optionObj.value,
        optionName: optionObj.optionName
      }));
    } else if (variant.options && Array.isArray(variant.options) && variant.options.length > 0) {
      // Handle options array format: ["Small", "Black"]
      // Map each option value to the correct Shopify structure
      optionValues = variant.options.map((optionValue, index) => {
        // Use provided optionNames if available, otherwise try to extract from product options
        // This prevents creating generic option names like "Option1", "Option2", etc.
        // Only use generic names as a last resort
        const optionName = (optionNames && optionNames[index]) ? optionNames[index] : `Option${index + 1}`;
        // logger.debug(`Mapping option ${index}: value="${optionValue}", optionName="${optionName}"`);
        return {
          name: optionValue,
          optionName: optionName
        };
      });
    } else {
      logger.warn(`Variant ${variantIndex} has no option values:`, JSON.stringify(variant, null, 2));
    }
    // logger.debug(`Transformed optionValues for variant ${variantIndex}:`, JSON.stringify(optionValues, null, 2));

    return {
      optionValues,
      price: variant.price ? variant.price.toString() : '0.00',
      ...(variant.compareAtPrice && { compareAtPrice: variant.compareAtPrice.toString() }),
      ...(variant.sku && { inventoryItem: { sku: variant.sku } }),
      // Add inventory quantities if locationId and inventoryQuantity are provided
      ...(locationId && variant.inventoryQuantity !== undefined && {
        inventoryQuantities: [
          {
            locationId: locationId,
            availableQuantity: variant.inventoryQuantity
          }
        ]
      }),
      // Add mediaSrc to link variant to its specific image
      // This must match one of the originalSource URLs in the media array
      ...(variant.imageUrl && { mediaSrc: variant.imageUrl })
    };
  });
  // // Log the transformed variants for debugging
  // logger.debug('Transformed variants for Shopify (first variant):', JSON.stringify(bulkVariantsInput[0], null, 2));
  // logger.debug('Total variants count:', bulkVariantsInput.length);

  try {
    const response = await axios.post(
      baseUrl,
      {
        query: mutation,
        variables: {
          productId: productId,
          variants: bulkVariantsInput
        },
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.errors) {
      logger.error('Shopify GraphQL errors:', response.data.errors);
      throw new AppError(
        `Shopify GraphQL Error: ${JSON.stringify(response.data.errors)}`,
        500
      );
    }

    const { productVariants, userErrors } = response.data.data.productVariantsBulkCreate;

    if (userErrors && userErrors.length > 0) {
      // Check if this is a duplicate variant error
      const alreadyExistsErrors = userErrors.filter(err =>
        err.message && err.message.includes('already exists')
      );

      if (alreadyExistsErrors.length > 0) {
        logger.warn('Some variants already exist on this product. This may be expected if variants were created in a previous step.');
        logger.warn('Duplicate variant errors:', alreadyExistsErrors.map(e => e.message));
        // Don't throw an error for duplicates - just log and continue
        // Instead of returning empty maps, try to fetch existing variant IDs
        logger.info('Fetching existing variants to build variantIdMap...');

        try {
          // Fetch the product with its variants to get existing variant IDs
          const productQuery = `
      query getProduct($id: ID!) {
        product(id: $id) {
          variants(first: 50) {
            edges {
              node {
                id
                sku
                inventoryItem {
                  id
                }
              }
            }
          }
        }
      }
    `;

          const productResponse = await axios.post(
            baseUrl,
            {
              query: productQuery,
              variables: { id: productId }
            },
            {
              headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
              },
            }
          );

          if (productResponse.data.errors) {
            logger.error('Error fetching product variants:', productResponse.data.errors);
            return {
              variantIdMap: {},
              inventoryItemIdMap: {}
            };
          }

          const productData = productResponse.data.data.product;
          const variantIdMap = {};
          const inventoryItemIdMap = {};

          if (productData && productData.variants && productData.variants.edges) {
            productData.variants.edges.forEach(edge => {
              const variant = edge.node;
              if (variant.sku) {
                variantIdMap[variant.sku] = variant.id;
                if (variant.inventoryItem && variant.inventoryItem.id) {
                  inventoryItemIdMap[variant.sku] = variant.inventoryItem.id;
                }
              }
            });

            logger.info(`Successfully fetched ${Object.keys(variantIdMap).length} existing variants`);
          }

          return {
            variantIdMap,
            inventoryItemIdMap
          };
        } catch (fetchError) {
          logger.error('Error fetching existing variants:', fetchError.message);
          // Return empty maps as fallback
          return {
            variantIdMap: {},
            inventoryItemIdMap: {}
          };
        }
      } else {
        logger.error('Shopify user errors:', userErrors);
        throw new AppError(
          `Shopify Error: ${userErrors.map(e => e.message).join(', ')}`,
          400
        );
      }
    }

    // Map variant IDs and inventory item IDs
    const variantIdMap = {};
    const inventoryItemIdMap = {};

    if (productVariants && productVariants.length > 0) {
      productVariants.forEach(variant => {
        if (variant.sku) {
          variantIdMap[variant.sku] = variant.id;
          if (variant.inventoryItem?.id) {
            inventoryItemIdMap[variant.sku] = variant.inventoryItem.id;
          }
        }
      });
    }

    return {
      variantIdMap,
      inventoryItemIdMap
    };

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const errorMessage = error.response?.data?.errors
      ? JSON.stringify(error.response.data.errors)
      : error.message;

    logger.error('Error creating product variants:', {
      message: errorMessage,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });

    throw new AppError(
      `Failed to create product variants: ${errorMessage}`,
      error.response?.status || 500
    );
  }
};

/**
 * Create a product on Shopify using productCreate with images and variant images in ONE call
 * This uses the mediaSrc field to link variants to their images
 * @param {string} shopDomain - Shopify shop domain (e.g., store.myshopify.com)
 * @param {string} accessToken - Shopify Admin API access token
 * @param {object} productInput - Product data with variants and images
 * @returns {object} - Created product with Shopify IDs
 */
const createShopifyProduct = async (shopDomain, accessToken, productInput) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  const { options, variants: originalVariants, images, processedVariants, ...productData } = productInput;
  // Use processed variants if available, otherwise use original variants
  const variants = processedVariants || originalVariants;
  const mutation = `
    mutation productCreate($input: ProductInput!, $media: [CreateMediaInput!]) {
      productCreate(input: $input, media: $media) {
        product {
          id
          handle
          status
          title
          media(first: 50) {
            nodes {
              ... on MediaImage {
                id
                image {
                  url
                  altText
                }
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  // Build product input (WITHOUT variants to prevent default variant creation)
  const productCreateInput = {
    title: productData.title,
    descriptionHtml: productData.descriptionHtml,
    productType: productData.productType,
    vendor: productData.vendor || '',
    tags: productData.tags || [],
    status: productData.status || 'ACTIVE',
    // IMPORTANT: Do not include variants here to prevent default variant creation
  };

  // Prepare media array with all images (product + variant images)
  const mediaInputs = images && Array.isArray(images) && images.length > 0 ? images.map((image, index) => ({
    alt: image.altText || `Product image ${index + 1}`,
    mediaContentType: 'IMAGE',
    originalSource: image.imageUrl
  })) : [];

  // Add product options WITHOUT variants
  // Only add productOptions if we have valid options with values
  if (options && Array.isArray(options) && options.length > 0) {
    // Filter out any options that don't have values
    const validOptions = options.filter(option => {
      if (typeof option === 'string') {
        return option.trim() !== '';
      } else if (option && typeof option === 'object') {
        return option.name &&
          option.name.trim() !== '' &&
          option.values &&
          Array.isArray(option.values) &&
          option.values.length > 0;
      }
      return false;
    });

    // Only add productOptions if we have valid options with values
    if (validOptions.length > 0) {
      productCreateInput.productOptions = validOptions.map((option, index) => {
        // Handle both string format and object format for options
        const optionName = typeof option === 'string' ? option : (option.name || `Option${index + 1}`);

        return {
          name: optionName,
          position: index + 1,
          // Handle both string array format and object array format for values
          values: (typeof option === 'string'
            ? [] // If option is a string, we don't have values yet
            : (option.values && Array.isArray(option.values) ? option.values : [])
          ).map(val => {
            // If val is already an object with a 'value' property, extract it
            // Otherwise if it's a string, use it directly
            // Otherwise if it's an object with a 'name' property, use that
            const valueName = typeof val === 'string' ? val : (val.value || val.name || '');
            return { name: valueName };
          }).filter(val => val.name && val.name.trim() !== ''), // Filter out empty values
        };
      }).filter(option => option.values.length > 0); // Filter out options with no values
    }
    // For simple products with empty options array, don't add productOptions at all
  }
  try {
    const response = await axios.post(
      baseUrl,
      {
        query: mutation,
        variables: {
          input: productCreateInput,
          media: mediaInputs.length > 0 ? mediaInputs : null
        },
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    // Handle GraphQL errors
    if (response.data.errors) {
      logger.error('Shopify GraphQL errors:', response.data.errors);
      throw new AppError(
        `Shopify GraphQL Error: ${JSON.stringify(response.data.errors)}`,
        500
      );
    }

    let { product, userErrors } = response.data.data.productCreate;

    // Handle user errors from Shopify
    if (userErrors && userErrors.length > 0) {
      logger.error('Shopify user errors:', userErrors);

      // Check if this is a handle conflict error
      const handleConflictError = userErrors.find(error =>
        error.message && error.message.includes('Handle has already been taken')
      );

      if (handleConflictError) {
        // If it's a handle conflict, try to create a unique handle by appending a timestamp
        logger.warn('Handle conflict detected, trying to create unique handle...');

        // Generate a unique handle by appending timestamp
        const uniqueHandle = `${productData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;

        // Update the product input with the unique handle
        const productCreateInputWithHandle = {
          ...productCreateInput,
          handle: uniqueHandle
        };

        logger.info(`Retrying with unique handle: ${uniqueHandle}`);

        // Retry the product creation with the unique handle
        const retryResponse = await axios.post(
          baseUrl,
          {
            query: mutation,
            variables: {
              input: productCreateInputWithHandle,
              media: mediaInputs.length > 0 ? mediaInputs : null
            },
          },
          {
            headers: {
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json',
            },
          }
        );

        // Check for errors in the retry response
        if (retryResponse.data.errors) {
          logger.error('Shopify GraphQL errors on retry:', retryResponse.data.errors);
          throw new AppError(
            `Shopify GraphQL Error: ${JSON.stringify(retryResponse.data.errors)}`,
            500
          );
        }

        const { product: retryProduct, userErrors: retryUserErrors } = retryResponse.data.data.productCreate;

        if (retryUserErrors && retryUserErrors.length > 0) {
          logger.error('Shopify user errors on retry:', retryUserErrors);
          throw new AppError(
            `Shopify Error: ${retryUserErrors.map(e => e.message).join(', ')}`,
            400
          );
        }

        // Use the retry response data
        product = retryProduct;
      } else {
        // For other errors, throw as before
        throw new AppError(
          `Shopify Error: ${userErrors.map(e => e.message).join(', ')}`,
          400
        );
      }
    }

    // STEP 2: Create variants if provided
    let variantIdMap = {};
    let inventoryItemIdMap = {};

    if (variants && variants.length > 0) {
      logger.info(`Creating ${variants.length} variants for product ${product.id}`);
      // Log the product ID to verify it's a new product
      logger.debug('New Shopify product created with ID:', product.id);

      // Check what variants already exist on this product
      const existingVariants = await checkExistingVariants(shopDomain, accessToken, product.id);

      // Use processed variants if available, otherwise use original variants
      const variantsToUse = productInput.processedVariants || variants;

      // Filter out variants that already exist
      // But be smart about it - only filter out exact matches, not the default variant
      const variantsToCreate = variantsToUse.filter(variant => {
        // Create signature for this variant dynamically based on all options
        // Format: option1:value1 / option2:value2 / option3:value3 ...
        const variantSignature = (options && Array.isArray(options) ? options : []).map((option, index) => {
          // Get the option value from either options array or optionValues object
          let optionValue = '';
          if (variant.options && Array.isArray(variant.options) && variant.options[index] !== undefined) {
            optionValue = variant.options[index];
          } else if (variant.optionValues && Array.isArray(variant.optionValues)) {
            const matchingOption = variant.optionValues.find(opt => opt.optionName === option.name);
            if (matchingOption) {
              optionValue = matchingOption.value;
            }
          }
          return `${option.name}:${optionValue}`;
        }).join(' / ');

        // Only filter out if this exact variant signature already exists
        // AND it's not the default Shopify variant (which typically has no options or generic options)
        const isDefaultVariant = !variantSignature || variantSignature.includes('Default') || variantSignature.includes('Title');
        const shouldFilterOut = existingVariants.includes(variantSignature) && !isDefaultVariant;

        if (shouldFilterOut) {
          logger.debug(`Skipping variant ${variantSignature} as it already exists`);
        }
        return !shouldFilterOut;
      });

      logger.info(`Filtered to ${variantsToCreate.length} new variants (skipped ${variantsToUse.length - variantsToCreate.length} existing)`);
      if (variantsToCreate.length > 0) {
        // Extract option names from the options array
        const optionNames = options && Array.isArray(options) ? options.map(opt => opt.name) : [];
        const variantResult = await createProductVariants(shopDomain, accessToken, product.id, variantsToCreate, productInput.locationId, optionNames);
        variantIdMap = variantResult.variantIdMap;
        inventoryItemIdMap = variantResult.inventoryItemIdMap;
      } else {
        logger.info('No new variants to create');
        variantIdMap = {};
        inventoryItemIdMap = {};
      }
    }

    // Handle default variant BEFORE media association
    // Check if we have a default variant that needs to be updated
    if (variants && variants.length > 0 && product?.id) {
      try {
        // Fetch product with variants to check for default variant
        const checkQuery = `
          query getProduct($id: ID!) {
            product(id: $id) {
              variants(first: 10) {
                edges {
                  node {
                    id
                    sku
                  }
                }
              }
            }
          }
        `;

        const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;
        const checkResponse = await axios.post(
          baseUrl,
          {
            query: checkQuery,
            variables: { id: product.id },
          },
          {
            headers: {
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json',
            },
          }
        );

        const fetchedProduct = checkResponse.data.data.product;
        if (fetchedProduct?.variants?.edges) {
          // Find the default variant (usually the first one with no SKU or generic SKU)
          const defaultVariant = fetchedProduct.variants.edges.find(edge => !edge.node.sku || edge.node.sku === '');
          if (defaultVariant) {
            const defaultVariantId = defaultVariant.node.id;
            logger.info(`Found default variant to update: ${defaultVariantId}`);

            // Find the corresponding variant data for this default variant
            // This would be the first variant in the variants array
            const defaultVariantData = variants[0];
            const defaultVariantSku = defaultVariantData.sku || `VAR-${Date.now()}-001`;

            // Add the default variant to the variantIdMap so media association can find it
            if (!variantIdMap[defaultVariantSku]) {
              variantIdMap[defaultVariantSku] = defaultVariantId;
              logger.info(`Added default variant ${defaultVariantSku} to variantIdMap`);
            }

            // ALSO UPDATE THE DEFAULT VARIANT WITH ITS PROPER DATA
            // This ensures price, inventory, and compareAtPrice are set
            try {
              // Prepare the update input with all the variant data
              const variantUpdateInput = {
                price: defaultVariantData.price ? defaultVariantData.price.toString() : '0.00',
                sku: defaultVariantSku,
                ...(defaultVariantData.compareAtPrice && {
                  compareAtPrice: defaultVariantData.compareAtPrice.toString()
                })
              };

              // Update the default variant with proper data
              const updatedVariant = await updateShopifyVariant(
                shopDomain,
                accessToken,
                product.id,
                defaultVariantId,
                variantUpdateInput
              );

              logger.info(`✓ Default variant ${defaultVariantSku} updated with price, SKU, and compareAtPrice`);

              // ALSO SET THE INVENTORY QUANTITY IF PROVIDED
              if (defaultVariantData.inventoryQuantity !== undefined && productInput.locationId) {
                // Get the inventoryItemId from the updated variant
                const inventoryItemId = updatedVariant.inventoryItemId;
                if (inventoryItemId) {
                  try {
                    await setInventoryOnHand(
                      shopDomain,
                      accessToken,
                      inventoryItemId,
                      productInput.locationId,
                      defaultVariantData.inventoryQuantity
                    );
                    logger.info(`✓ Set inventory quantity ${defaultVariantData.inventoryQuantity} for variant ${defaultVariantSku}`);
                  } catch (inventoryError) {
                    logger.error('Failed to set inventory for default variant:', inventoryError.message);
                  }
                } else {
                  logger.warn('No inventoryItemId found for default variant, skipping inventory update');
                }
              }
            } catch (updateError) {
              logger.error('Failed to update default variant data:', updateError.message);
            }
          }
        }
      } catch (checkError) {
        logger.warn('Could not check for default variant:', checkError.message);
      }
    }

    // Fetch product with variants to get variant IDs and inventory item IDs
    const variantQuery = `
      query getProduct($id: ID!) {
        product(id: $id) {
          variants(first: 100) {
            edges {
              node {
                id
                sku
                price
                inventoryItem {
                  id
                }
                media(first: 5) {
                  nodes {
                    ... on MediaImage {
                      id
                      image {
                        url
                      }
                    }
                  }
                }
              }
            }
          }
          media(first: 50) {
            nodes {
              ... on MediaImage {
                id
                image {
                  url
                  altText
                }
              }
            }
          }
        }
      }
    `;

    const variantResponse = await axios.post(
      baseUrl,
      {
        query: variantQuery,
        variables: { id: product.id },
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    // Extract and map variant IDs and inventory item IDs
    const variantMediaMap = {};
    const fetchedProduct = variantResponse.data.data.product;

    // POPULATE VARIANT ID MAP WITH ALL VARIANTS (including default ones) BEFORE MEDIA ASSOCIATION
    if (fetchedProduct?.variants?.edges) {
      fetchedProduct.variants.edges.forEach((edge) => {
        const variant = edge.node;
        if (variant.sku) {
          // Use the variant IDs from our bulk create if available, otherwise from query
          if (!variantIdMap[variant.sku]) {
            variantIdMap[variant.sku] = variant.id;
          }
          if (variant.inventoryItem?.id && !inventoryItemIdMap[variant.sku]) {
            inventoryItemIdMap[variant.sku] = variant.inventoryItem.id;
          }
          if (variant.media?.nodes && variant.media.nodes.length > 0) {
            variantMediaMap[variant.sku] = (variant.media.nodes || []).map(m => m.image?.url).filter(url => url !== undefined);
          }
        }
      });
    }

    // STEP 3: Associate media with variants using productVariantAppendMedia    // Only do this if we have variants with image URLs and we have media from the product
    if (variants && variants.length > 0 && fetchedProduct?.media?.nodes && fetchedProduct.media.nodes.length > 0) {
      try {
        // Create mapping of image URLs to media IDs
        const imageUrlToMediaIdMap = {};
        fetchedProduct.media.nodes.forEach(media => {
          if (media.image && media.image.url) {
            imageUrlToMediaIdMap[media.image.url] = media.id;
          }
        });

        // Wait a moment to ensure media is fully processed
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Create variantMedia array for productVariantAppendMedia
        const variantMedia = [];

        // Match variants with their images
        variants.forEach(variant => {
          if (variant.imageUrl) {
            // Find the corresponding Shopify variant ID from our created variants
            const shopifyVariantId = variantIdMap[variant.sku];

            if (shopifyVariantId) {
              // Find the media ID for this image URL
              let mediaId = imageUrlToMediaIdMap[variant.imageUrl];

              // If exact match not found, try partial matching with more robust logic
              if (!mediaId) {
                const variantImageUrl = variant.imageUrl.toLowerCase();
                const variantFilename = variantImageUrl.split('/').pop().split('?')[0].split('.')[0];

                for (const [url, id] of Object.entries(imageUrlToMediaIdMap)) {
                  const shopifyFilename = url.toLowerCase().split('/').pop().split('?')[0].split('.')[0];

                  // Try multiple matching strategies
                  if (url.toLowerCase() === variantImageUrl ||
                    url.toLowerCase().includes(variantFilename) ||
                    variantImageUrl.includes(shopifyFilename) ||
                    variantFilename.includes(shopifyFilename) ||
                    shopifyFilename.includes(variantFilename)) {
                    mediaId = id;
                    logger.debug(`Matched variant image URL: ${variantImageUrl} with Shopify media: ${url}`);
                    break;
                  }
                }
              }
              if (mediaId) {
                variantMedia.push({
                  variantId: shopifyVariantId,
                  mediaIds: [mediaId]
                });
              } else {
                logger.warn(`Could not find media ID for variant ${variant.sku} with imageUrl: ${variant.imageUrl}`);
                logger.debug('Available media URLs:', Object.keys(imageUrlToMediaIdMap));
              }
            } else {
              logger.warn(`Could not find Shopify variant ID for variant SKU: ${variant.sku}`);
            }
          }
        });

        // Only call appendMediaToVariants if we have variantMedia to append
        if (variantMedia.length > 0) {
          // logger.info(`Associating ${variantMedia.length} images with variants`);
          // logger.debug('Variant media mapping:', JSON.stringify(variantMedia, null, 2));

          try {
            const appendResult = await appendMediaToVariants(
              shopDomain,
              accessToken,
              product.id,
              variantMedia,
              true // Enable deletion of old media
            );

            logger.info(`Successfully appended media to ${appendResult.productVariants?.length || 0} variants`);
          } catch (appendError) {
            logger.error('Failed to append media to variants:', appendError);
            // Log the full error for debugging
            if (appendError.response?.data) {
              logger.error('Full error response:', JSON.stringify(appendError.response.data, null, 2));
            }
          }
        } else {
          logger.info('No variant media to append');
        }
      } catch (mediaError) {
        logger.error('Error processing media association:', mediaError);
        // Don't fail the whole operation if media association fails
      }
    }

    if (fetchedProduct?.variants?.edges) {
      fetchedProduct.variants.edges.forEach((edge) => {
        const variant = edge.node;
        if (variant.sku) {
          // Use the variant IDs from our bulk create if available, otherwise from query
          if (!variantIdMap[variant.sku]) {
            variantIdMap[variant.sku] = variant.id;
          }
          if (variant.inventoryItem?.id && !inventoryItemIdMap[variant.sku]) {
            inventoryItemIdMap[variant.sku] = variant.inventoryItem.id;
          }
          if (variant.media?.nodes && variant.media.nodes.length > 0) {
            variantMediaMap[variant.sku] = (variant.media.nodes || []).map(m => m.image?.url).filter(url => url !== undefined);
          }
        }
      });
    }

    logger.info(`Product created with ${Object.keys(variantIdMap).length} variants and images successfully linked`);

    return {
      shopifyProductId: product.id,
      handle: product.handle,
      status: product.status,
      variantIdMap,
      inventoryItemIdMap,
      variantMediaMap, // Map of SKU -> array of image URLs
      productMedia: product.media?.nodes || []
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const errorMessage = error.response?.data?.errors
      ? JSON.stringify(error.response.data.errors)
      : error.message;

    logger.error('Error creating Shopify product with images:', {
      message: errorMessage,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });

    throw new AppError(
      `Failed to create product on Shopify: ${errorMessage}`,
      error.response?.status || 500
    );
  }
};



// const fetchShopifyProductsGql = async (shopName, accessToken, graphqlQuery, options) => {
//     let baseUrl = `https://${shopName}/admin/api/2025-10/graphql.json`
//     const { first, query, sortKey } = options
//     const response = await axios.post(
//         baseUrl,
//         {
//             query: graphqlQuery,
//             variables: {
//                 first,
//                 query: query || null,
//                 sortKey,
//             },
//         },
//         {
//             headers: {
//                 'X-Shopify-Access-Token': accessToken,
//                 'Content-Type': 'application/json',
//             },
//         },
//     );

//     if (response.data.errors) {
//         throw new Error(`GraphQL Errors: ${JSON.stringify(response.data.errors)}`);
//     }
//     return response.data.data.products;
// }

// const fetchShopifyProductsWithPaginationGql = async (shopName, accessToken, graphqlQuery, options) => {
//     const baseUrl = `https://${shopName}/admin/api/2025-10/graphql.json`;
//     const {
//         first,
//         cursor,
//         query,
//         sortKey
//     } = options
//     const response = await axios.post(
//         baseUrl,
//         {
//             query: graphqlQuery,
//             variables: {
//                 first: first, // Maximum per page
//                 after: cursor,
//                 query: query || null,
//                 sortKey
//             }
//         },
//         {
//             headers: {
//                 'X-Shopify-Access-Token': accessToken,
//                 'Content-Type': 'application/json'
//             }
//         }
//     );

//     if (response.data.errors) {
//         throw new Error(`GraphQL Errors: ${JSON.stringify(response.data.errors)}`);
//     }

//     return response.data.data.products;
// }

/**
 * Update a product on Shopify using Admin GraphQL API
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify Admin API access token
 * @param {string} shopifyProductId - Shopify product ID (gid://shopify/Product/xxx)
 * @param {object} productInput - Updated product data
 * @returns {object} - Updated product info
 */
const updateShopifyProduct = async (shopDomain, accessToken, shopifyProductId, productInput) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  const { options, variants, tags, ...productData } = productInput;

  const mutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          handle
          status
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const updateInput = {
    id: shopifyProductId,
    title: productData.title,
    descriptionHtml: productData.descriptionHtml,
    productType: productData.productType,
    vendor: productData.vendor,
    tags: productData.tags || [],
    status: productData.status,
  };

  try {
    const response = await axios.post(
      baseUrl,
      {
        query: mutation,
        variables: { input: updateInput },
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.errors) {
      logger.error('Shopify GraphQL errors:', response.data.errors);
      throw new AppError(
        `Shopify GraphQL Error: ${JSON.stringify(response.data.errors)}`,
        500
      );
    }

    const { product, userErrors } = response.data.data.productUpdate;

    if (userErrors && userErrors.length > 0) {
      logger.error('Shopify user errors:', userErrors);
      throw new AppError(
        `Shopify Error: ${userErrors.map(e => e.message).join(', ')}`,
        400
      );
    }

    return {
      shopifyProductId: product.id,
      handle: product.handle,
      status: product.status,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const errorMessage = error.response?.data?.errors
      ? JSON.stringify(error.response.data.errors)
      : error.message;

    logger.error('Error updating Shopify product:', {
      message: errorMessage,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });

    throw new AppError(
      `Failed to update product on Shopify: ${errorMessage}`,
      error.response?.status || 500
    );
  }
};

/**
 * Update a single variant using productVariantsBulkUpdate mutation
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify Admin API access token
 * @param {string} productId - Shopify product ID
 * @param {string} variantId - Shopify variant ID
 * @param {object} variantInput - Updated variant data
 * @returns {object} - Updated variant info
 */
const updateShopifyVariant = async (shopDomain, accessToken, productId, variantId, variantInput) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  const mutation = `
    mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          sku
          price
          compareAtPrice
          inventoryItem {
            id
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  // Transform the variantInput to match ProductVariantsBulkInput format
  const bulkVariantInput = {
    id: variantId,
    ...(variantInput.price && { price: variantInput.price }),
    ...(variantInput.sku && { inventoryItem: { sku: variantInput.sku } }),
    ...(variantInput.compareAtPrice && { compareAtPrice: variantInput.compareAtPrice }),
  };

  try {
    const response = await axios.post(
      baseUrl,
      {
        query: mutation,
        variables: {
          productId: productId,
          variants: [bulkVariantInput]
        },
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.errors) {
      logger.error('Shopify GraphQL errors:', response.data.errors);
      throw new AppError(
        `Shopify GraphQL Error: ${JSON.stringify(response.data.errors)}`,
        500
      );
    }

    const { productVariants, userErrors } = response.data.data.productVariantsBulkUpdate;

    if (userErrors && userErrors.length > 0) {
      logger.error('Shopify user errors:', userErrors);
      throw new AppError(
        `Shopify Error: ${userErrors.map(e => e.message).join(', ')}`,
        400
      );
    }

    if (productVariants && productVariants.length > 0) {
      const updatedVariant = productVariants[0];
      return {
        shopifyVariantId: updatedVariant.id,
        sku: updatedVariant.sku,
        price: updatedVariant.price,
        compareAtPrice: updatedVariant.compareAtPrice,
        inventoryItemId: updatedVariant.inventoryItem?.id,
      };
    } else {
      throw new AppError('No variant returned from update', 400);
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const errorMessage = error.response?.data?.errors
      ? JSON.stringify(error.response.data.errors)
      : error.message;

    logger.error('Error updating Shopify variant:', {
      message: errorMessage,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });

    throw new AppError(
      `Failed to update variant on Shopify: ${errorMessage}`,
      error.response?.status || 500
    );
  }
};

/**
 * Enable inventory tracking for a variant
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify Admin API access token
 * @param {string} inventoryItemId - Shopify inventory item ID
 * @returns {object} - Updated inventory item
 */
const enableInventoryTracking = async (shopDomain, accessToken, inventoryItemId) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  const mutation = `
    mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) {
        inventoryItem {
          id
          tracked
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      baseUrl,
      {
        query: mutation,
        variables: {
          id: inventoryItemId,
          input: {
            tracked: true
          }
        },
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.errors) {
      logger.error('Shopify GraphQL errors:', response.data.errors);
      throw new AppError(
        `Shopify GraphQL Error: ${JSON.stringify(response.data.errors)}`,
        500
      );
    }

    const { inventoryItem, userErrors } = response.data.data.inventoryItemUpdate;

    if (userErrors && userErrors.length > 0) {
      logger.error('Shopify user errors:', userErrors);
      throw new AppError(
        `Shopify Error: ${userErrors.map(e => e.message).join(', ')}`,
        400
      );
    }

    return {
      inventoryItemId: inventoryItem.id,
      tracked: inventoryItem.tracked,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const errorMessage = error.response?.data?.errors
      ? JSON.stringify(error.response.data.errors)
      : error.message;

    logger.error('Error enabling inventory tracking:', {
      message: errorMessage,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });

    throw new AppError(
      `Failed to enable inventory tracking: ${errorMessage}`,
      error.response?.status || 500
    );
  }
};

/**
 * Activate inventory item at a specific location
 * This MUST be called after enabling tracking and BEFORE setting quantities
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify Admin API access token
 * @param {string} inventoryItemId - Shopify inventory item ID (gid://shopify/InventoryItem/xxx)
 * @param {string} locationId - Location ID (gid://shopify/Location/xxx)
 * @returns {object} - Inventory level info
 */
const activateInventoryAtLocation = async (shopDomain, accessToken, inventoryItemId, locationId) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  const mutation = `
    mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
      inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
        inventoryLevel {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    inventoryItemId,
    locationId
  };

  try {
    const response = await axios.post(
      baseUrl,
      { query: mutation, variables },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.errors) {
      logger.error('Shopify GraphQL errors:', response.data.errors);
      throw new AppError(
        `Shopify GraphQL Error: ${JSON.stringify(response.data.errors)}`,
        500
      );
    }

    const { inventoryLevel, userErrors } = response.data.data.inventoryActivate;

    if (userErrors && userErrors.length > 0) {
      // Check if it's already activated (not a real error)
      const alreadyActivated = userErrors.some(e =>
        e.message.toLowerCase().includes('already') ||
        e.message.toLowerCase().includes('active')
      );

      if (!alreadyActivated) {
        logger.error('Shopify user errors:', userErrors);
        throw new AppError(
          `Shopify Error: ${userErrors.map(e => e.message).join(', ')}`,
          400
        );
      }
      logger.info('Inventory already activated at location');
    }

    return inventoryLevel;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const errorMessage = error.response?.data?.errors
      ? JSON.stringify(error.response.data.errors)
      : error.message;

    logger.error('Error activating inventory at location:', {
      message: errorMessage,
      status: error.response?.status,
    });

    throw new AppError(
      `Failed to activate inventory at location: ${errorMessage}`,
      error.response?.status || 500
    );
  }
};

/**
 * Get the first available location ID
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify Admin API access token
 * @returns {string} - Location ID
 */
const getFirstLocationId = async (shopDomain, accessToken) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  const query = `
    query getLocations {
      locations(first: 1, query: "active:true") {
        edges {
          node {
            id
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      baseUrl,
      {
        query: query,
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.errors) {
      logger.error('Shopify GraphQL errors:', response.data.errors);
      throw new AppError(
        `Shopify GraphQL Error: ${JSON.stringify(response.data.errors)}`,
        500
      );
    }

    const locations = response.data.data.locations.edges;
    if (!locations || locations.length === 0) {
      throw new AppError('No active locations found', 404);
    }

    return locations[0].node.id;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const errorMessage = error.response?.data?.errors
      ? JSON.stringify(error.response.data.errors)
      : error.message;

    logger.error('Error getting location ID:', {
      message: errorMessage,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });

    throw new AppError(
      `Failed to get location ID: ${errorMessage}`,
      error.response?.status || 500
    );
  }
};

/**
 * Get all active locations from Shopify
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify Admin API access token
 * @returns {array} - Array of location objects with id, name, and isActive
 */
const getLocations = async (shopDomain, accessToken) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  const query = `
    query getLocations {
      locations(first: 10, query: "active:true") {
        edges {
          node {
            id
            name
            isActive
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      baseUrl,
      { query },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.errors) {
      logger.error('Shopify GraphQL errors:', response.data.errors);
      throw new AppError(
        `Shopify GraphQL Error: ${JSON.stringify(response.data.errors)}`,
        500
      );
    }

    const locations = response.data.data.locations.edges;
    if (!locations || locations.length === 0) {
      throw new AppError('No active locations found', 404);
    }

    return locations.map(edge => ({
      id: edge.node.id,
      name: edge.node.name,
      isActive: edge.node.isActive
    }));
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const errorMessage = error.response?.data?.errors
      ? JSON.stringify(error.response.data.errors)
      : error.message;

    logger.error('Error getting locations:', {
      message: errorMessage,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });

    throw new AppError(
      `Failed to get locations: ${errorMessage}`,
      error.response?.status || 500
    );
  }
};

/**
 * Update inventory quantities using inventoryAdjustQuantities
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify Admin API access token
 * @param {array} inventoryChanges - Array of inventory changes
 * @param {string} locationId - Location ID
 * @returns {object} - Adjustment results
 */
const updateInventoryQuantities = async (shopDomain, accessToken, inventoryChanges, locationId) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  const mutation = `
    mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
      inventoryAdjustQuantities(input: $input) {
        inventoryAdjustmentGroup {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  // Format changes for the mutation
  const changes = inventoryChanges.map(change => ({
    inventoryItemId: change.inventoryItemId,
    locationId: locationId,
    delta: change.delta,
  }));

  try {
    const response = await axios.post(
      baseUrl,
      {
        query: mutation,
        variables: {
          input: {
            changes: changes,
            name: "available",
            reason: "correction"
          },
        },
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.errors) {
      logger.error('Shopify GraphQL errors:', response.data.errors);
      throw new AppError(
        `Shopify GraphQL Error: ${JSON.stringify(response.data.errors)}`,
        500
      );
    }

    const { inventoryAdjustmentGroup, userErrors } = response.data.data.inventoryAdjustQuantities;

    if (userErrors && userErrors.length > 0) {
      logger.error('Shopify user errors:', userErrors);
      throw new AppError(
        `Shopify Error: ${userErrors.map(e => e.message).join(', ')}`,
        400
      );
    }

    return {
      adjustmentGroupId: inventoryAdjustmentGroup.id,
      changesApplied: changes.length,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const errorMessage = error.response?.data?.errors
      ? JSON.stringify(error.response.data.errors)
      : error.message;

    logger.error('Error updating inventory quantities:', {
      message: errorMessage,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });

    throw new AppError(
      `Failed to update inventory quantities: ${errorMessage}`,
      error.response?.status || 500
    );
  }
};

/**
 * Set inventory quantities using inventorySetQuantities mutation
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify Admin API access token
 * @param {string} inventoryItemId - Shopify inventory item ID
 * @param {string} locationId - Location ID
 * @param {number} quantity - Quantity to set
 * @returns {object} - Response data
 */
const setInventoryQuantities = async (shopDomain, accessToken, inventoryItemId, locationId, quantity) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  const mutation = `
    mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        inventoryAdjustmentGroup {
          createdAt
          reason
          changes {
            name
            delta
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      name: "available", // Can be "available" or "on_hand"
      reason: "correction",
      ignoreCompareQuantity: true, // Important: bypasses the compare check
      quantities: [
        {
          inventoryItemId: inventoryItemId,
          locationId: locationId,
          quantity: quantity
        }
      ]
    }
  };

  try {
    const response = await axios.post(
      baseUrl,
      { query: mutation, variables },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.errors) {
      logger.error('Shopify GraphQL errors:', response.data.errors);
      throw new AppError(
        `Shopify GraphQL Error: ${JSON.stringify(response.data.errors)}`,
        500
      );
    }

    const { inventoryAdjustmentGroup, userErrors } = response.data.data.inventorySetQuantities;

    if (userErrors && userErrors.length > 0) {
      logger.error('Shopify user errors:', userErrors);
      throw new AppError(
        `Shopify Error: ${userErrors.map(e => e.message).join(', ')}`,
        400
      );
    }

    return response.data;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const errorMessage = error.response?.data?.errors
      ? JSON.stringify(error.response.data.errors)
      : error.message;

    logger.error('Error setting inventory quantities:', {
      message: errorMessage,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });

    throw new AppError(
      `Failed to set inventory quantities: ${errorMessage}`,
      error.response?.status || 500
    );
  }
};

/**
 * Update product variants on Shopify
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify Admin API access token
 * @param {string} productId - Shopify product ID (gid://shopify/Product/xxx)
 * @param {array} variants - Array of variant updates with shopifyVariantId
 * @returns {object} - Updated variant info
 */
const updateShopifyVariants = async (shopDomain, accessToken, productId, variants) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  // Filter variants that have Shopify IDs
  const variantsToUpdate = variants.filter(v => v.shopifyVariantId);

  if (variantsToUpdate.length === 0) {
    logger.warn('No variants with Shopify IDs to update');
    return [];
  }

  const mutation = `
    mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        product {
          id
        }
        productVariants {
          id
          price
          compareAtPrice
          sku
          selectedOptions {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variantInputs = variantsToUpdate.map(variant => {
    const input = {
      id: variant.shopifyVariantId,
    };

    // Only add price if defined
    if (variant.price !== undefined && variant.price !== null) {
      input.price = String(variant.price);
    }

    // Only add compareAtPrice if it's a valid number (not null, undefined, or "null")
    if (variant.compareAtPrice !== undefined &&
      variant.compareAtPrice !== null &&
      variant.compareAtPrice !== "null" &&
      variant.compareAtPrice !== "") {
      input.compareAtPrice = String(variant.compareAtPrice);
    }

    // Include optionValues if provided (required by Shopify API)
    if (variant.optionValues && Array.isArray(variant.optionValues) && variant.optionValues.length > 0) {
      // Handle different formats: either array of strings or array of objects with name/value
      if (typeof variant.optionValues[0] === 'string') {
        // Convert array of strings to array of objects with default names
        // This assumes the options match the product's option names in order
        input.optionValues = variant.optionValues.map((value, index) => ({
          name: value, // The actual option value like "Small"
          optionName: `Option${index + 1}` // The option name like "Option1"
        }));
      } else {
        // Handle different formats: {name, optionName} or {id, optionName}
        // According to Shopify docs, for ProductVariantsBulkUpdate, use: {name: value, optionName: optionName}
        input.optionValues = variant.optionValues.map(optionValue => {
          if (optionValue.id && optionValue.optionName) {
            // This is the hybrid format {id, optionName}
            // We need to map this back to name-based format {name, optionName}
            // We need to extract the actual option value name from the ID
            // The ID is like 'gid://shopify/ProductOptionValue/5818954645802'
            // We need to get the actual value (like 'Small', 'Black') from the database or elsewhere
            // For now, we'll need to query the actual option value name, but since we don't have access to DB here,
            // we'll need to pass the actual value name from the ProductService
            // For this fix, I'll assume that when using the hybrid format, the name field contains the actual value
            return {
              name: optionValue.name, // Use the actual option value name (e.g., "Small", "Black")
              optionName: optionValue.optionName
            };
          } else {
            // This is the name-based format {name, optionName}
            return {
              name: optionValue.name,
              optionName: optionValue.optionName
            };
          }
        });
      }
    } else {
      // Shopify requires optionValues to be provided even if empty
      input.optionValues = [];
    }

    // NOTE: SKU is NOT allowed in ProductVariantsBulkInput - it's read-only
    // Shopify doesn't allow updating SKU via bulk update mutation

    return input;
  });

  try {
    const response = await axios.post(
      baseUrl,
      {
        query: mutation,
        variables: {
          productId: productId,
          variants: variantInputs
        },
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.errors) {
      logger.error('Shopify GraphQL errors:', response.data.errors);
      throw new AppError(
        `Shopify GraphQL Error: ${JSON.stringify(response.data.errors)}`,
        500
      );
    }

    const { productVariants, userErrors } = response.data.data.productVariantsBulkUpdate;

    if (userErrors && userErrors.length > 0) {
      logger.error('Shopify user errors:', userErrors);
      throw new AppError(
        `Shopify Error: ${userErrors.map(e => e.message).join(', ')}`,
        400
      );
    }

    logger.info(`Successfully updated ${productVariants.length} variants on Shopify`);

    return productVariants.map(pv => ({
      shopifyVariantId: pv.id,
      price: pv.price,
      sku: pv.sku,
    }));
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const errorMessage = error.response?.data?.errors
      ? JSON.stringify(error.response.data.errors)
      : error.message;

    logger.error('Error updating Shopify variants:', {
      message: errorMessage,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });

    throw new AppError(
      `Failed to update variants on Shopify: ${errorMessage}`,
      error.response?.status || 500
    );
  }
};

/**
 * Set inventory on hand for a specific inventory item at a location
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify Admin API access token
 * @param {string} inventoryItemId - Shopify inventory item ID (gid://shopify/InventoryItem/xxx)
 * @param {string} locationId - Location ID (gid://shopify/Location/xxx)
 * @param {number} quantity - Quantity to set
 * @returns {object} - Updated inventory level
 */
const setInventoryOnHand = async (shopDomain, accessToken, inventoryItemId, locationId, quantity) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  const mutation = `
    mutation inventorySetOnHand($input: InventorySetOnHandInput!) {
      inventorySetOnHand(input: $input) {
        inventoryLevel {
          available
          location {
            id
            name
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      baseUrl,
      {
        query: mutation,
        variables: {
          input: {
            inventoryItemId,
            locationId,
            quantity,
            ignoreCompareQuantity: true // Bypass quantity checks
          }
        },
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.errors) {
      logger.error('Shopify GraphQL errors:', response.data.errors);
      throw new AppError(
        `Shopify GraphQL Error: ${JSON.stringify(response.data.errors)}`,
        500
      );
    }

    const { inventoryLevel, userErrors } = response.data.data.inventorySetOnHand;

    if (userErrors && userErrors.length > 0) {
      logger.error('Shopify user errors:', userErrors);
      throw new AppError(
        `Shopify Error: ${userErrors.map(e => e.message).join(', ')}`,
        400
      );
    }

    return {
      available: inventoryLevel.available,
      location: inventoryLevel.location
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const errorMessage = error.response?.data?.errors
      ? JSON.stringify(error.response.data.errors)
      : error.message;

    logger.error('Error setting inventory on hand:', {
      message: errorMessage,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });

    throw new AppError(
      `Failed to set inventory on hand: ${errorMessage}`,
      error.response?.status || 500
    );
  }
};

/**
 * Delete a product variant from Shopify
 * @param {string} shopDomain - Shopify shop domain
 * @param {string} accessToken - Shopify Admin API access token
 * @param {string} variantId - Shopify variant ID (gid://shopify/ProductVariant/xxx)
 * @returns {object} - Deletion result with success status and deletedProductVariantId
 */
const deleteShopifyVariant = async (shopDomain, accessToken, variantId) => {
  const baseUrl = `https://${shopDomain}/admin/api/2025-01/graphql.json`;

  const mutation = `
    mutation productVariantDelete($id: ID!) {
      productVariantDelete(id: $id) {
        deletedProductVariantId
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    id: variantId
  };

  try {
    logger.info(`Deleting variant ${variantId} from Shopify store ${shopDomain}`);

    const response = await axios.post(
      baseUrl,
      {
        query: mutation,
        variables: variables
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        }
      }
    );

    const result = response.data.data.productVariantDelete;

    if (result.userErrors && result.userErrors.length > 0) {
      logger.error(`Shopify variant deletion errors: ${JSON.stringify(result.userErrors)}`);
      throw new AppError(
        `Shopify variant deletion failed: ${result.userErrors.map(e => e.message).join(', ')}`,
        400
      );
    }

    logger.info(`✓ Successfully deleted variant ${variantId} from Shopify`);

    return {
      success: true,
      deletedProductVariantId: result.deletedProductVariantId
    };
  } catch (error) {
    logger.error(`Error deleting Shopify variant ${variantId}:`, error.message);

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      `Failed to delete variant from Shopify: ${error.message}`,
      error.response?.status || 500
    );
  }
};


module.exports = {
  appendMediaToVariants,
  createProductVariants,
  createShopifyProduct,
  createShopifyProductMedia,
  attachMediaToVariants,
  waitForMediaReady,
  getProductMediaStatus,
  getProductDetails,
  updateProductOption,
  updateShopifyProduct,
  updateShopifyVariant,  // Updated function
  updateShopifyVariants,
  updateVariantImages,
  productVariantDetachMedia,
  productDeleteMedia,
  enableInventoryTracking,
  activateInventoryAtLocation,
  getFirstLocationId,
  getLocations,
  setInventoryQuantities,
  updateInventoryQuantities,
  setInventoryOnHand,
  deleteShopifyVariant
}
