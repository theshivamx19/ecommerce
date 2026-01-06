const OpenAI = require("openai");
const fs = require("fs");
const { getProductType } = require("../Product/ProductTypeService");
const db = require("../../models");
const logger = require("../../utils/logger");

const client = new OpenAI({ apiKey: process.env.OPEN_API_KEY });

 
/* ---------- helpers (unchanged) ---------- */
function parseOutput(text) {
  let title = "Untitled";
  let description = text;
  const lines = text.split("\n").filter(Boolean);
  if (lines[0]) {
    if (/^title[:\-]/i.test(lines[0])) {
      title = lines[0].replace(/^title[:\-]/i, "").trim();
      description = lines.slice(1).join(" ").trim();
    } else {
      title = lines[0].trim();
      description = lines.slice(1).join(" ").trim();
    }
  }
  return { title, description };
}

async function safeGenerateMetadata(options, flow=null, retries = 3, delay = 2000) {
  logger.info('Safe generate metadata');
  try {
    return await generateMetadata(options, flow);
  } catch (err) {
    if (err.status === 429 && retries > 0) {
      logger.info(`Rate limited. Retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      return safeGenerateMetadata(options, flow=null, retries - 1, delay * 2);
    }
    logger.info('Safe generate metadata failed');
    throw err;
  }
}
 
/* ---------- NEW: single call for any number of images ---------- */
async function generateMetadata({
  images = [],
  title = null,
  description = null,
}, flow=null) {
  if (images.length === 0 && (!title || !description)) {
    logger.info('Generate metadata failed');
    throw new Error("Either images or instruction must be provided.");
  }
  logger.info('Generate metadata'); 
  const tools = [
    {
      type: "function",
      function: {
        name: "getProductTypes",
        description:
          "Fetch all valid product types that the product must belong to",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },
  ];
 
  const content = [];

  let prompt = null;
  if(flow){
    logger.info('Flow is passed to generate metadata');
    // prompt = JSON.parse(flow?.aiPrompts) || '';
    prompt = typeof flow.aiPrompts === 'string'
        ? JSON.parse(flow.aiPrompts)
        : flow.aiPrompts;
  }

  const userPrompt = `You will be shown product images.

        You are an expert product analyst.
        Generate and return:
        ${prompt?.prompt1 || ''}

        You must ALWAYS follow the instructions:
        1. Call "getProductTypes"
        2. Analyze product images
        3. Select the SINGLE best matching product type
        4. If none match clearly, return an empty string for "type"
        5. Do NOT invent or modify product type names

        Return STRICT JSON ONLY:
        {
          "title": "string",
          "description": "string",
          "type": "string"
        }

        No markdown. No explanations. No extra text.`;

        const backendAiPrompt = `You will be shown product images.

        You are an expert product analyst.

        Your task:
        1. First, call the function "getProductTypes" to retrieve the list of valid product types.
        2. Analyze the product images carefully.
        3. Select the SINGLE best matching product type from the provided list.

        Rules:
        - You MUST choose exactly ONE product type from the list, unless none clearly match.
        - Each product type has:
          - name
          - category
        - Use BOTH image understanding and category context.
        - If none match clearly, return an empty string for "type".
        - Do NOT invent or modify product type names.

        Generate and return:
        - title: concise, max 12 words
        - description: factual, 2–4 sentences, no marketing claims
        - type: exact product type name from the list (or empty string)
        
        Return STRICT JSON ONLY:
        {
          "title": "string",
          "description": "string",
          "type": "string"
        }

        No markdown. No explanations. No extra text.
        `.trim();
        
 
  const finalAiPrompt = flow ? userPrompt : backendAiPrompt;

  content.push({
    type: "text",
    text: finalAiPrompt,
  });
  
  images.forEach((base64) => {
    content.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${base64}` },
    });
  });
 
  const firstResponse = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content }],
    tools,
    tool_choice: {
      type: "function",
      function: { name: "getProductTypes" },
    },
  });
 
  const toolCall = firstResponse.choices[0].message.tool_calls?.[0];
  if (!toolCall) {
    logger.info('Product types tool call was not triggered');
    throw new Error("Product types tool call was not triggered");
  }
 
  const productTypes = await getProductType();
  logger.info('Product types fetched');
  
  const finalResponse = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "user", content },
      firstResponse.choices[0].message,
      {
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(
          productTypes.map((pt) => ({
            name: pt.name,
            category: pt.category,
          }))
        ),
      },
    ],
  });
  
  const json = JSON.parse(finalResponse.choices[0].message.content);
  logger.info('Metadata generated');
  
  return json
}

 
 
/* ---------- public wrapper ---------- */
async function generateMetadataMultiple({ images = [], title = null, description = null}, flowId = null) {
  logger.info('Generate metadata multiple');
  if (images.length === 0 && (!title || !description)) {
    logger.info('Generate metadata multiple failed');
    throw new Error("Either images or instruction must be provided.");
  }
 
  // convert multer file objects → base64
  // const base64Images = images.map((file) => {
  //   const buffer = fs.readFileSync(file.path);
  //   return buffer.toString("base64");
  // });

  let flow=null;
  if (flowId) {
    logger.info('Flow id is passed to generate metadata multiple');
    flow = await db.Flow.findByPk(flowId);
  }

  const base64Images = await Promise.all(
  images.map(async (file) => {
    logger.info('Converting image to base64');
    const res = await fetch(file.location); // file.location is S3 URL
    if (!res.ok) throw new Error(`Failed to fetch ${file.location}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer.toString("base64");
  })
);

  // single OpenAI call
  const result = await safeGenerateMetadata({
    images: base64Images,
    title,
    description
  }, flow);
 
  // keep the old contract: return array with one element
  logger.info('Generate metadata multiple completed');
  return result;
}
 
module.exports = {
  generateMetadataMultiple, 
  safeGenerateMetadata
};
 
 
// const pLimit = require("p-limit"); // Install with: npm install p-limit
// const OpenAI = require("openai");
// const client = new OpenAI({ apiKey: process.env.OPEN_API_KEY });
 
 
// /**
//  * Generate title and description from image or text instruction
//  * @param {Object} options
//  * @param {Buffer|string} [options.image] - Optional image buffer or base64
//  * @param {string} [options.instruction] - Optional text instruction
//  */
// async function generateMetadata({ image, instruction = null }) {
//   if (!image && !instruction) {
//     throw new Error("Either image or instruction must be provided.");
//   }
 
//   const messages = [];
//   if (image) {
//     const base64Image = Buffer.isBuffer(image) ? image.toString("base64") : image;
//     messages.push({
//       role: "user",
//       content: [
//         { type: "text", text: "Generate a short title and detailed description for this image." },
//         { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
//       ]
//     });
//   }
 
//   if (instruction) {
//     messages.push({
//       role: "user",
//       content: [
//         { type: "text", text: `Generate a short title and detailed description based on this instruction: "${instruction}"` }
//       ]
//     });
//   }
 
//   const response = await client.chat.completions.create({
//     model: "gpt-4o-mini",
//     messages
//   });
 
//   const output = response.choices[0].message.content;
//   return parseOutput(output);
// }
 
// /**
//  * Parse model output to {title, description}
//  */
// function parseOutput(text) {
//   let title = "Untitled";
//   let description = text;
 
//   const lines = text.split("\n").filter(Boolean);
 
//   if (lines[0]) {
//     if (/^title[:\-]/i.test(lines[0])) {
//       title = lines[0].replace(/^title[:\-]/i, "").trim();
//       description = lines.slice(1).join(" ").trim();
//     } else {
//       title = lines[0].trim();
//       description = lines.slice(1).join(" ").trim();
//     }
//   }
 
//   return { title, description };
// }
 
// /**
//  * Retry wrapper for generateMetadata
//  */
// async function safeGenerateMetadata(options, retries = 3, delay = 2000) {
//   try {
//     return await generateMetadata(options);
//   } catch (err) {
//     if (err.status === 429 && retries > 0) {
//       console.warn(`Rate limited. Retrying in ${delay}ms...`);
//       await new Promise(res => setTimeout(res, delay));
//       return safeGenerateMetadata(options, retries - 1, delay * 2); // Exponential backoff
//     }
//     throw err;
//   }
// }
 
// /**
//  * Generate metadata for multiple images safely with concurrency limit
//  * @param {Object} options
//  * @param {Array<Buffer|string>} [options.images] - Array of images
//  * @param {string} [options.instruction] - Optional text instruction
//  * @param {number} [options.concurrency=2] - Max concurrent requests
//  */
// async function generateMetadataMultiple({ images = [], instruction = null, concurrency = 2 }, req) {
//   if (images.length === 0 && !instruction) {
//     throw new Error("Either images or instruction must be provided.");
//   }
 
//   const limit = pLimit(concurrency);
//   const results = [];
 
//   if (images.length > 0) {
//     const tasks = images.map(image => {
//       // Read the file buffer and convert to base64
//       const fs = require('fs');
//       const imageBuffer = fs.readFileSync(image.path);
//       const base64Image = imageBuffer.toString('base64');
 
//       console.log(`Processing image: ${image.filename}`)
//       return limit(() => safeGenerateMetadata({ image: base64Image, instruction }))
//     }
//     );
//     return await Promise.all(tasks);
//   } else {
//     const result = await safeGenerateMetadata({ instruction });
//     return [result];
//   }
// }
 
// module.exports = generateMetadataMultiple;