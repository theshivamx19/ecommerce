const uploadBufferToS3 = require('./uploadBufferToS3');
const logger = require('./logger');
const fetch = require('node-fetch');

/**
 * Convert a base64 image string to an S3 URL
 * @param {string} base64String - The base64 encoded image string
 * @param {string} fileName - The desired file name for the S3 upload
 * @param {string} folder - The S3 folder to upload to (default: 'products')
 * @param {string} mimeType - The MIME type of the image (default: 'image/png')
 * @returns {string} - The S3 URL of the uploaded image
 */
const convertBase64ToS3 = async (base64String, fileName, folder = 'products', mimeType = 'image/png') => {
  try {
    // Remove data URL prefix if present (e.g., "data:image/png;base64,")
    const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
    
    // Convert base64 string to buffer
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    // Generate a unique filename if not provided
    const uniqueFileName = fileName || `image_${Date.now()}`;
    
    // Upload buffer to S3
    const result = await uploadBufferToS3(imageBuffer, uniqueFileName, folder, mimeType);
    
    logger.info(`Successfully converted base64 image to S3 URL: ${result.url}`);
    
    return result.url;
  } catch (error) {
    logger.error('Error converting base64 to S3:', error);
    throw error;
  }
};

/**
 * Convert an array of base64 image strings to S3 URLs
 * @param {Array<string>} base64Array - Array of base64 encoded image strings
 * @param {string} folder - The S3 folder to upload to (default: 'products')
 * @returns {Array<string>} - Array of S3 URLs
 */
const convertBase64ArrayToS3 = async (base64Array, folder = 'products') => {
  try {
    if (!Array.isArray(base64Array)) {
      throw new Error('Input must be an array of base64 strings');
    }
    
    const s3Urls = [];
    
    for (let i = 0; i < base64Array.length; i++) {
      const base64String = base64Array[i];
      const fileName = `product_image_${Date.now()}_${i}`;
      
      // Determine MIME type from the data URL prefix
      let mimeType = 'image/png';
      if (base64String.startsWith('data:image/jpeg')) {
        mimeType = 'image/jpeg';
      } else if (base64String.startsWith('data:image/jpg')) {
        mimeType = 'image/jpeg';
      } else if (base64String.startsWith('data:image/gif')) {
        mimeType = 'image/gif';
      } else if (base64String.startsWith('data:image/webp')) {
        mimeType = 'image/webp';
      }
      
      const s3Url = await convertBase64ToS3(base64String, fileName, folder, mimeType);
      s3Urls.push(s3Url);
    }
    
    return s3Urls;
  } catch (error) {
    logger.error('Error converting base64 array to S3:', error);
    throw error;
  }
};

/**
 * Download an image from a URL and upload it to S3
 * @param {string} imageUrl - The URL of the image to download
 * @param {string} fileName - The desired file name for the S3 upload
 * @param {string} folder - The S3 folder to upload to (default: 'products')
 * @returns {string} - The S3 URL of the uploaded image
 */
const downloadImageFromUrlAndUploadToS3 = async (imageUrl, fileName, folder = 'products') => {
  try {
    // Download the image from the URL
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to download image from URL: ${imageUrl}, Status: ${response.status}`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    
    // Determine MIME type from the response or URL
    let mimeType = response.headers.get('content-type') || 'image/png';
    if (!mimeType.startsWith('image/')) {
      // If content-type is not an image, try to determine from URL
      if (imageUrl.toLowerCase().endsWith('.jpg') || imageUrl.toLowerCase().endsWith('.jpeg')) {
        mimeType = 'image/jpeg';
      } else if (imageUrl.toLowerCase().endsWith('.png')) {
        mimeType = 'image/png';
      } else if (imageUrl.toLowerCase().endsWith('.gif')) {
        mimeType = 'image/gif';
      } else if (imageUrl.toLowerCase().endsWith('.webp')) {
        mimeType = 'image/webp';
      }
    }
    
    // Generate a unique filename if not provided
    const uniqueFileName = fileName || `image_${Date.now()}`;
    
    // Upload buffer to S3
    const result = await uploadBufferToS3(buffer, uniqueFileName, folder, mimeType);
    
    logger.info(`Successfully downloaded image from URL and uploaded to S3: ${imageUrl} -> ${result.url}`);
    
    return result.url;
  } catch (error) {
    logger.error('Error downloading image from URL and uploading to S3:', error);
    throw error;
  }
};

/**
 * Download an array of images from URLs and upload them to S3
 * @param {Array<string>} imageUrls - Array of image URLs to download
 * @param {string} folder - The S3 folder to upload to (default: 'products')
 * @returns {Array<string>} - Array of S3 URLs
 */
const downloadImagesFromUrlsAndUploadToS3 = async (imageUrls, folder = 'products') => {
  try {
    if (!Array.isArray(imageUrls)) {
      throw new Error('Input must be an array of image URLs');
    }
    
    const s3Urls = [];
    
    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i];
      const fileName = `product_image_${Date.now()}_${i}`;
      
      const s3Url = await downloadImageFromUrlAndUploadToS3(imageUrl, fileName, folder);
      s3Urls.push(s3Url);
    }
    
    return s3Urls;
  } catch (error) {
    logger.error('Error downloading images from URLs and uploading to S3:', error);
    throw error;
  }
};

module.exports = {
  convertBase64ToS3,
  convertBase64ArrayToS3,
  downloadImageFromUrlAndUploadToS3,
  downloadImagesFromUrlsAndUploadToS3
};