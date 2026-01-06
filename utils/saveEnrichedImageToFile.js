// async function downloadToFile(url, filename = 'image.png') {
//   const res = await fetch(url);
//   if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);

//   const buffer = Buffer.from(await res.arrayBuffer());

//   return new File([buffer], filename, {
//     type: res.headers.get('content-type') || 'image/png',
//   });
// }

// module.exports = downloadToFile;


// In utils/saveEnrichedImageToFile.js or wherever downloadToFile is defined
// const { toFile } = require('openai'); // Add this import
// const logger = require('../utils/logger');

// async function downloadToFile(url, filename = 'image.png') {
//   const res = await fetch(url);
//   if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);

//   const buffer = Buffer.from(await res.arrayBuffer());
//   const contentType = res.headers.get('content-type') || 'image/png';

//   // FIX: Use toFile() to create a file object compatible with OpenAI SDK
//   return await toFile(buffer, filename, {
//     type: contentType,
//   });
// }



const { toFile } = require('openai'); // Add this import
const logger = require('../utils/logger');

async function downloadToFile(url, filename = 'image.png') {
  try {
    logger.info(`Starting download for file: ${filename} from URL: ${url}`);
    
    const res = await fetch(url);
    if (!res.ok) {
      const errorMsg = `GET ${url} → ${res.status} ${res.statusText}`;
      logger.error(`Download failed: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = res.headers.get('content-type') || 'image/png';

    logger.info(`Successfully downloaded ${filename}. Size: ${buffer.length} bytes. Type: ${contentType}`);

    // FIX: Use toFile() to create a file object compatible with OpenAI SDK
    return await toFile(buffer, filename, {
      type: contentType,
    });

  } catch (error) {
    logger.error(`Error in downloadToFile for ${filename}: ${error.message}`, { stack: error.stack });
    throw error;
  }
}

module.exports = downloadToFile;
