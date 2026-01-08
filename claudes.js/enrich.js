const ProductEnrichmentService = require('../../services/AI/ProductEnrichmentService');
const logger = require('../../utils/logger');

/**
 * Optimized controller with async job processing
 */
const enrichProductController = async (req, res) => {
    try {
        const { images, flowId } = req?.body;

        // Validate input
        if (!images || !Array.isArray(images) || images.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No images provided'
            });
        }

        if (images.length > 20) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 20 images allowed per request'
            });
        }

        // Return immediately with job ID for async processing
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Start background processing (don't await)
        ProductEnrichmentService.enrichProductDataAsync(
            { images }, 
            flowId, 
            jobId
        ).catch(error => {
            logger.error(`Background job ${jobId} failed:`, error);
        });

        // Return job ID immediately
        return res.status(202).json({
            success: true,
            message: 'Image enhancement started',
            jobId,
            totalImages: images.length,
            estimatedTime: `${images.length * 15-20} seconds`
        });

    } catch (error) {
        logger.error('Error in enrichProductController:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to start image enhancement',
            error: error.message
        });
    }
};

/**
 * Check job status endpoint
 */
const checkJobStatusController = async (req, res) => {
    try {
        const { jobId } = req.params;
        const status = await ProductEnrichmentService.getJobStatus(jobId);

        if (!status) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: status
        });

    } catch (error) {
        logger.error('Error checking job status:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to check job status',
            error: error.message
        });
    }
};

/**
 * Synchronous endpoint for small batches (1-3 images)
 */
const enrichProductSyncController = async (req, res) => {
    try {
        const { images, flowId } = req?.body;

        if (!images || !Array.isArray(images)) {
            return res.status(400).json({
                success: false,
                message: 'No images provided'
            });
        }

        if (images.length > 3) {
            return res.status(400).json({
                success: false,
                message: 'Use async endpoint for more than 3 images'
            });
        }

        // Set a timeout for the entire operation
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), 50000); // 50 seconds
        });

        const resultPromise = ProductEnrichmentService.enrichProductData(
            { images }, 
            flowId,
            { concurrent: true }
        );

        const result = await Promise.race([resultPromise, timeoutPromise]);

        return res.status(200).json({
            success: true,
            message: 'Images enhanced successfully',
            data: result
        });

    } catch (error) {
        logger.error('Error in sync enrichment:', error);
        
        if (error.message === 'Request timeout') {
            return res.status(504).json({
                success: false,
                message: 'Request timed out. Please use async endpoint for large batches.'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Failed to enhance images',
            error: error.message
        });
    }
};

module.exports = {
    enrichProductController,
    checkJobStatusController,
    enrichProductSyncController
};







// ============================================
// downloadToFile.js - Optimized with timeout
// ============================================
const { toFile } = require('openai');
const logger = require('../utils/logger');

const DOWNLOAD_TIMEOUT = 30000; // 30 seconds

async function downloadToFile(url, filename = 'image.png') {
  try {
    logger.info(`Starting download: ${filename}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);

    const res = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0' // Some servers require this
      }
    });
    
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = res.headers.get('content-type') || 'image/png';

    logger.info(`Downloaded ${filename}: ${(buffer.length / 1024).toFixed(2)} KB`);

    return await toFile(buffer, filename, { type: contentType });

  } catch (error) {
    if (error.name === 'AbortError') {
      logger.error(`Download timeout for ${filename}`);
      throw new Error(`Download timeout after ${DOWNLOAD_TIMEOUT}ms`);
    }
    logger.error(`Download failed for ${filename}:`, error.message);
    throw error;
  }
}

module.exports = downloadToFile;


// ============================================
// uploadBufferToS3.js - Optimized with retry
// ============================================
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const logger = require('../utils/logger');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  maxAttempts: 3, // Built-in retry
  requestHandler: {
    connectionTimeout: 30000, // 30 seconds
    socketTimeout: 30000
  }
});

const uploadBufferToS3 = async (
  buffer,
  fileName,
  folder = 'enhanced',
  mimeType = 'image/png',
  retryCount = 0
) => {
  const maxRetries = 2;
  const key = `${folder}/${Date.now()}-${fileName}`;

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ServerSideEncryption: 'AES256', // Add encryption
        // ACL: 'public-read', // Only if needed
      })
    );

    const url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    logger.info(`Uploaded to S3: ${key}`);

    return { key, url };

  } catch (error) {
    logger.error(`S3 upload failed (attempt ${retryCount + 1}):`, error.message);

    if (retryCount < maxRetries) {
      const delay = 1000 * Math.pow(2, retryCount);
      logger.info(`Retrying S3 upload after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return uploadBufferToS3(buffer, fileName, folder, mimeType, retryCount + 1);
    }

    throw error;
  }
};

module.exports = uploadBufferToS3;





// ============================================
// routes/enrichment.routes.js
// ============================================
const express = require('express');
const router = express.Router();
const {
  enrichProductController,
  checkJobStatusController,
  enrichProductSyncController
} = require('../controllers/enrichProductController');

// Async endpoint for large batches (returns job ID immediately)
router.post('/enrich/async', enrichProductController);

// Check job status
router.get('/enrich/status/:jobId', checkJobStatusController);

// Sync endpoint for small batches (1-3 images)
router.post('/enrich/sync', enrichProductSyncController);

module.exports = router;


// ============================================
// PACKAGE.JSON - Add this dependency
// ============================================
/*
{
  "dependencies": {
    "p-limit": "^4.0.0"
  }
}

Run: npm install p-limit
*/


// ============================================
// CLIENT USAGE EXAMPLES
// ============================================

// Example 1: Async processing (recommended for 4+ images)
async function enrichImagesAsync() {
  // Start the job
  const startResponse = await fetch('/api/enrich/async', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      images: [
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg',
        // ... up to 20 images
      ],
      flowId: 'flow_123'
    })
  });

  const { jobId, estimatedTime } = await startResponse.json();
  console.log(`Job started: ${jobId}, ETA: ${estimatedTime}`);

  // Poll for status
  const checkStatus = async () => {
    const statusResponse = await fetch(`/api/enrich/status/${jobId}`);
    const { data } = await statusResponse.json();
    
    console.log(`Status: ${data.status}, Progress: ${data.progress}%`);

    if (data.status === 'completed') {
      console.log('Enhanced images:', data.result.enhanceImages);
      console.log('Metadata:', data.result.metadata);
      return data.result;
    } else if (data.status === 'failed') {
      throw new Error(data.error);
    } else {
      // Still processing, check again in 5 seconds
      setTimeout(checkStatus, 5000);
    }
  };

  checkStatus();
}

// Example 2: Sync processing (for 1-3 images only)
async function enrichImagesSync() {
  const response = await fetch('/api/enrich/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      images: [
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg'
      ],
      flowId: 'flow_123'
    })
  });

  const { data } = await response.json();
  console.log('Enhanced images:', data.enhanceImages);
  console.log('Metadata:', data.metadata);
}


// ============================================
// PRODUCTION IMPROVEMENTS
// ============================================

/*
1. REPLACE IN-MEMORY JOB STORE WITH REDIS:

const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

// Store job
await redis.set(
  `job:${jobId}`, 
  JSON.stringify(jobData),
  'EX',
  3600 // Expire after 1 hour
);

// Get job
const jobData = JSON.parse(await redis.get(`job:${jobId}`));


2. ADD QUEUE SYSTEM (Bull/BullMQ):

const Queue = require('bull');
const enrichmentQueue = new Queue('enrichment', process.env.REDIS_URL);

// Add job to queue
const job = await enrichmentQueue.add({
  images,
  flowId,
  jobId
});

// Process jobs
enrichmentQueue.process(3, async (job) => {
  return await enrichProductData(job.data);
});


3. ADD WEBSOCKET FOR REAL-TIME UPDATES:

const io = require('socket.io')(server);

// In service, emit progress
io.to(jobId).emit('progress', {
  current: processedCount,
  total: images.length,
  percentage: (processedCount / images.length) * 100
});


4. MONITORING & ALERTING:

const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});

// In catch blocks
Sentry.captureException(error);


5. RATE LIMITING:

const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});

router.post('/enrich/async', limiter, enrichProductController);


6. COST OPTIMIZATION:

- Cache flow details (Redis/memory cache)
- Batch metadata generation
- Use smaller image sizes when appropriate
- Implement image deduplication
- Add cost tracking per job
*/


// ============================================
// NGINX CONFIGURATION (for production)
// ============================================
/*
server {
    location /api/enrich {
        proxy_pass http://localhost:3000;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Important: Don't wait for full response
        proxy_buffering off;
        proxy_request_buffering off;
    }
}
*/


// ============================================
// ENVIRONMENT VARIABLES
// ============================================
/*
# OpenAI
OPEN_API_KEY=sk-...

# AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_BUCKET_NAME=your-bucket

# Redis (for production)
REDIS_URL=redis://localhost:6379

# Monitoring (optional)
SENTRY_DSN=https://...
*/