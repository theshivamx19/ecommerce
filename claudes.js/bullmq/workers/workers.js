// workers/shopify.worker.js
const { Worker } = require('bullmq');
const { redisConfig } = require('../config/redis');
const { 
  processProductCreate,
  processProductUpdate,
  processInventoryUpdate,
  processVariantUpdate
} = require('../jobs');

// Create worker instance
const shopifyWorker = new Worker(
  'shopify-webhooks',
  async (job) => {
    console.log(`Processing job ${job.id} of type ${job.name}`);
    
    try {
      // Route to appropriate processor based on job type
      switch (job.name) {
        case 'product:create':
          await processProductCreate(job.data);
          break;
          
        case 'product:update':
          await processProductUpdate(job.data);
          break;
          
        case 'inventory:update':
          await processInventoryUpdate(job.data);
          break;
          
        case 'variant:update':
          await processVariantUpdate(job.data);
          break;
          
        default:
          console.warn(`Unknown job type: ${job.name}`);
      }
      
      console.log(`Job ${job.id} completed successfully`);
      return { success: true, jobId: job.id };
      
    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
      throw error; // This will trigger retry
    }
  },
  {
    connection: redisConfig,
    concurrency: 5, // Process 5 jobs simultaneously
    limiter: {
      max: 10, // Max 10 jobs
      duration: 1000 // per second (respects Shopify rate limits)
    }
  }
);

// Worker event listeners
shopifyWorker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} has been completed`);
});

shopifyWorker.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} has failed with error:`, err.message);
});

shopifyWorker.on('error', (err) => {
  console.error('Worker error:', err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing worker...');
  await shopifyWorker.close();
  process.exit(0);
});

module.exports = shopifyWorker;