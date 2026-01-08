// queues/shopify.queue.js
const { Queue } = require('bullmq');
const { redisConfig } = require('../config/redis');

// Create queue instance
const shopifyQueue = new Queue('shopify-webhooks', {
  connection: redisConfig,
  defaultJobOptions: {
    attempts: 3, // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 2000 // Start with 2 seconds, then 4s, 8s...
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000 // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600 // Keep failed jobs for 7 days
    }
  }
});

// Helper function to add jobs to queue
const addShopifyJob = async (jobType, data, options = {}) => {
  try {
    const job = await shopifyQueue.add(jobType, data, {
      ...options,
      // Add job ID for deduplication if needed
      jobId: options.jobId || `${jobType}-${data.id || Date.now()}`
    });
    
    console.log(`Job ${jobType} added with ID: ${job.id}`);
    return job;
  } catch (error) {
    console.error(`Failed to add job ${jobType}:`, error);
    throw error;
  }
};

// Specific job adders for different webhook types
const addProductCreateJob = (productData) => {
  return addShopifyJob('product:create', productData);
};

const addProductUpdateJob = (productData) => {
  return addShopifyJob('product:update', productData, {
    // Use product ID for deduplication to avoid processing same update twice
    jobId: `product-update-${productData.id}-${Date.now()}`
  });
};

const addInventoryUpdateJob = (inventoryData) => {
  return addShopifyJob('inventory:update', inventoryData, {
    priority: 1 // Higher priority for inventory updates
  });
};

const addProductVariantUpdateJob = (variantData) => {
  return addShopifyJob('variant:update', variantData);
};

module.exports = {
  shopifyQueue,
  addShopifyJob,
  addProductCreateJob,
  addProductUpdateJob,
  addInventoryUpdateJob,
  addProductVariantUpdateJob
};