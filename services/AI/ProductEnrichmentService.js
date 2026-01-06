require('dotenv').config();
const OpenAI = require('openai');
const { Buffer } = require('node:buffer');
const fs = require('fs');
const path = require('path');
const downloadToFile = require('../../utils/saveEnrichedImageToFile');
const { safeGenerateMetadata } = require('../../services/AI/ImageToTextService');
const uploadBufferToS3 = require('../../utils/uploadBufferToS3');
const AppError = require('../../utils/AppError');
const { getFlowDetailsByIdService } = require('../../services/Flow/FlowService')
const logger = require('../../utils/logger');

const openai = new OpenAI({
  apiKey: process.env.OPEN_API_KEY,
});

const MODEL = 'gpt-image-1';
const SIZE = '1024x1024';


async function downloadToBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const OUT_DIR = path.resolve(__dirname, '../../uploads/enhanced');
fs.mkdirSync(OUT_DIR, { recursive: true });

function saveBuffer(buf, fileName = `enhanced_${Date.now()}.png`) {
  const fullPath = path.join(OUT_DIR, fileName);
  fs.writeFileSync(fullPath, buf);
  return fullPath;
}

async function enhanceOne(imageFile, flow, size = SIZE) {
  logger.info("Started enhancing image");
  let userPrompt = null;
  if (flow) {
    // userPrompt = JSON.parse(flow?.aiPrompts) || {}
    // FIX: Only parse if it's a string, otherwise use it directly
      userPrompt = typeof flow.aiPrompts === 'string'
        ? JSON.parse(flow.aiPrompts)
        : flow.aiPrompts;
  }

  const PROMPT =
    `You are a product catalog expert

    Image handling instructions:
    - Do NOT crop, cut, or trim the image.
    - The full product must be visible from top to bottom.
    - Do NOT cut off the top or bottom of the product.

    ${flow ? userPrompt?.prompt2 : `Professionally enhance this image: sharpen details,
    correct exposure and colors, remove noise, keep original
    do not cut the image from the edges or any direction
    composition, deliver photo-realistic quality.`}`

  const response = await openai.images.edit({
    model: 'gpt-image-1',
    image: imageFile,
    prompt: PROMPT,
    size,
  });
  logger.info('Image enhanced successfully');
  return response.data[0].b64_json;
}

const enrichProductData = async function (
  { images },
  flowId,
  { size = SIZE } = {}
) {
  logger.info('Starting image enhancement process');
  const files = await Promise.all(
    images.map((url, i) => downloadToFile(url, `image_${i}.png`))
  );

  let flow = null;
  if (flowId) {
    flow = await getFlowDetailsByIdService(flowId)
    if (!flow) {
      logger.error('Flow not found');
      throw new AppError("Flow not found", 404);
    }
  }
  const b64array = await Promise.all(
    files.map(file => enhanceOne(file, flow, size))
  );
  logger.info('Image enhancement completed');
  const metadata = await safeGenerateMetadata({ images: b64array }, flow)
  logger.info('Metadata generated');
  const enhanceImages = await Promise.all(b64array.map(async (b64, idx) => {
    const buffer = Buffer.from(b64, 'base64');
    const fileName = `enhanced_${Date.now()}_${idx}.png`;
    // const localPath = saveBuffer(buf, fileName);
    // return localPath;
    const { url } = await uploadBufferToS3(buffer, fileName);
    return url
  }));
  logger.info('Images uploaded to S3');
  return {
    enhanceImages,
    metadata
  }
};

module.exports = {
  enrichProductData,
};



// const OpenAI = require("openai");
// const fs = require("fs");

// const client = new OpenAI({ apiKey: process.env.OPEN_API_KEY });

// async function enrichProductData({ images }) {
//   if (!images || images.length === 0) {
//     throw new Error("At least one image URL must be provided.");
//   }

//   // -----------------------------
//   // STEP 1: Generate metadata
//   // -----------------------------
//   const metadata = await Promise.all(
//     images.map(async (imageUrl) => {
//       const response = await client.chat.completions.create({
//         model: "gpt-4o-mini",
//         messages: [
//           {
//             role: "user",
//             content: [
//               {
//                 type: "text",
//                 text: `
// You are a product catalog expert.

// From the given product image, generate:
// - title
// - description
// - productType

// Return STRICT JSON only:
// {
//   "title": "string",
//   "description": "string",
//   "productType": "string"
// }
//                 `.trim(),
//               },
//               {
//                 type: "image_url",
//                 image_url: { url: imageUrl },
//               },
//             ],
//           },
//         ],
//         response_format: { type: "json_object" },
//       });

//       return JSON.parse(response.choices[0].message.content);
//     })
//   );

//   // -----------------------------
//   // STEP 2: Enhance images
//   // -----------------------------
//   const enhancedImages = await Promise.all(
//     images.map(async (imageUrl) => {
//       const enhanced = await client.images.edit({
//         model: "gpt-image-1",
//         image: imageUrl, // ✅ URL works directly
//         prompt:
//           "Enhance this product image. Improve resolution, lighting, sharpness, and colors. Keep the product realistic.",
//       });

//       return enhanced.data[0].b64_json; // enhanced image (base64)
//     })
//   );

//   // -----------------------------
//   // STEP 3: Combine results
//   // -----------------------------
//   return metadata.map((item, index) => ({
//     image: enhancedImages[index],
//     title: item.title,
//     description: item.description,
//     productType: item.productType,
//   }));
// }

// module.exports = {
//   enrichProductData
// };

















// const OpenAI = require("openai");
// const fs = require("fs");
// const path = require("path");

// const client = new OpenAI({ apiKey: process.env.OPEN_API_KEY });

// /**
//  * Enhance an uploaded image using OpenAI
//  * @param {Buffer|string} image - Image buffer or base64 string
//  * @param {Object} options
//  * @param {string} [options.prompt] - Optional enhancement prompt (e.g., "Enhance clarity and colors")
//  * @param {number} [options.size] - Optional size, e.g., 1024 (for 1024x1024)
//  * @returns {Promise<Buffer>} - Enhanced image as Buffer
//  */
// async function enhanceImage(image, options = {}) {
//   const { prompt = "Enhance the image quality and clarity", size = 1024 } = options;

//   // Convert Buffer to base64 if needed
//   const base64Image = Buffer.isBuffer(image) ? image.toString("base64") : image;

//   try {
//     const response = await client.images.edit({
//       model: "gpt-image-1",
//       image: Buffer.from(base64Image, "base64"),
//       prompt,
//       size: `${size}x${size}`
//     });

//     // The API returns base64 image data
//     const enhancedBase64 = response.data[0].b64_json;
//     return Buffer.from(enhancedBase64, "base64");

//   } catch (error) {
//     console.error("Error enhancing image:", error);
//     throw error;
//   }
// }


// async function enhanceImagesMultiple(images, options = {}) {
//   if (!images || images.length === 0) {
//     throw new Error("No images provided");
//   }

//   const enhancedImages = [];

//   for (const image of images) {
//     const enhanced = await enhanceImage(image, options);
//     enhancedImages.push(enhanced);
//   }

//   return enhancedImages; // Array of Buffers
// }


// module.exports = enhanceImagesMultiple;
