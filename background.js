// BullMQ Product Sync Implementation



// ============================================
// 1. Installation Required
// ============================================
// npm install bullmq ioredis express shopify-api-node

// ============================================
// 2. Redis Connection Setup
// ============================================
// config/redis.js
const { Queue, Worker, QueueEvents } = require('bullmq');
const Redis = require('ioredis');

const redisConnection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
});

module.exports = { redisConnection };

// ============================================
// 3. Queue Setup
// ============================================
// queues/productSyncQueue.js
const { Queue } = require('bullmq');
const { redisConnection } = require('../config/redis');

const productSyncQueue = new Queue('product-sync', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 second delay
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
      age: 24 * 3600, // Keep completed jobs for 24 hours
    },
    removeOnFail: {
      count: 500, // Keep last 500 failed jobs
    },
  },
});

module.exports = { productSyncQueue };

// ============================================
// 4. Worker Implementation
// ============================================
// workers/productSyncWorker.js
const { Worker } = require('bullmq');
const { redisConnection } = require('../config/redis');
const Shopify = require('shopify-api-node');

// Simulate Shopify API client (replace with your actual implementation)
const getShopifyClient = (storeDomain, accessToken) => {
  return new Shopify({
    shopName: storeDomain,
    accessToken: accessToken,
  });
};

const productSyncWorker = new Worker(
  'product-sync',
  async (job) => {
    const { productData, targetStores, sourceStore } = job.data;
    
    console.log(`Processing job ${job.id}: Syncing product to ${targetStores.length} stores`);
    
    const results = {
      successful: [],
      failed: [],
      totalStores: targetStores.length,
    };

    // Update progress to 0%
    await job.updateProgress(0);

    for (let i = 0; i < targetStores.length; i++) {
      const store = targetStores[i];
      
      try {
        console.log(`Syncing to store: ${store.domain}`);
        
        // Initialize Shopify client for target store
        const shopify = getShopifyClient(store.domain, store.accessToken);
        
        // Check if product already exists
        let existingProduct = null;
        if (productData.sourceProductId) {
          // Search by metafield or custom logic
          const products = await shopify.product.list({ 
            limit: 1,
            fields: 'id,title'
          });
          // You might want to use metafields to track synced products
        }

        // Prepare product data for target store
        const productPayload = {
          title: productData.title,
          body_html: productData.description,
          vendor: productData.vendor,
          product_type: productData.productType,
          tags: productData.tags,
          variants: productData.variants?.map(v => ({
            price: v.price,
            sku: v.sku,
            inventory_quantity: v.inventory,
            weight: v.weight,
            weight_unit: v.weightUnit,
          })),
          images: productData.images?.map(img => ({
            src: img.src,
            alt: img.alt,
          })),
          metafields: [
            {
              namespace: 'sync',
              key: 'source_product_id',
              value: productData.sourceProductId,
              type: 'single_line_text_field',
            },
            {
              namespace: 'sync',
              key: 'source_store',
              value: sourceStore,
              type: 'single_line_text_field',
            },
          ],
        };

        // Create or update product
        let result;
        if (existingProduct) {
          result = await shopify.product.update(existingProduct.id, productPayload);
        } else {
          result = await shopify.product.create(productPayload);
        }

        results.successful.push({
          store: store.domain,
          productId: result.id,
          productHandle: result.handle,
        });

        console.log(`✓ Successfully synced to ${store.domain}`);
        
      } catch (error) {
        console.error(`✗ Failed to sync to ${store.domain}:`, error.message);
        
        results.failed.push({
          store: store.domain,
          error: error.message,
          errorCode: error.statusCode,
        });
      }

      // Update progress
      const progress = Math.round(((i + 1) / targetStores.length) * 100);
      await job.updateProgress(progress);
    }

    // Return final results
    return results;
  },
  {
    connection: redisConnection,
    concurrency: 5, // Process 5 jobs simultaneously
    limiter: {
      max: 10, // Max 10 jobs
      duration: 1000, // Per 1 second (respect Shopify rate limits)
    },
  }
);

// Event listeners for the worker
productSyncWorker.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed successfully`);
  console.log(`Successful: ${result.successful.length}/${result.totalStores}`);
  console.log(`Failed: ${result.failed.length}/${result.totalStores}`);
});

productSyncWorker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed with error:`, err.message);
});

productSyncWorker.on('error', (err) => {
  console.error('Worker error:', err);
});

module.exports = { productSyncWorker };

// ============================================
// 5. API Controller - Add Jobs
// ============================================
// controllers/productController.js
const { productSyncQueue } = require('../queues/productSyncQueue');

const syncProductToStores = async (req, res) => {
  try {
    const { productData, targetStores, sourceStore } = req.body;

    // Validate input
    if (!productData || !targetStores || targetStores.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Product data and target stores are required',
      });
    }

    // Add job to queue
    const job = await productSyncQueue.add(
      'sync-product',
      {
        productData,
        targetStores,
        sourceStore,
      },
      {
        jobId: `sync-${productData.sourceProductId}-${Date.now()}`,
        priority: 1, // Higher priority = processed first
      }
    );

    res.status(202).json({
      success: true,
      message: 'Product sync job added to queue',
      jobId: job.id,
      estimatedTime: `${targetStores.length * 2} seconds`,
    });

  } catch (error) {
    console.error('Error adding sync job:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue product sync',
      error: error.message,
    });
  }
};

// ============================================
// 6. API Controller - Check Job Status
// ============================================
const getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await productSyncQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found',
      });
    }

    const state = await job.getState();
    const progress = job.progress;
    const result = job.returnvalue;

    res.json({
      success: true,
      job: {
        id: job.id,
        state, // 'waiting', 'active', 'completed', 'failed', 'delayed'
        progress: `${progress}%`,
        data: job.data,
        result,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
      },
    });

  } catch (error) {
    console.error('Error fetching job status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch job status',
      error: error.message,
    });
  }
};

module.exports = {
  syncProductToStores,
  getJobStatus,
};

// ============================================
// 7. Express Routes
// ============================================
// routes/productRoutes.js
const express = require('express');
const router = express.Router();
const { syncProductToStores, getJobStatus } = require('../controllers/productController');

// Start product sync
router.post('/sync', syncProductToStores);

// Get job status
router.get('/sync/status/:jobId', getJobStatus);

module.exports = router;

// ============================================
// 8. Main App Setup
// ============================================
// app.js
const express = require('express');
const productRoutes = require('./routes/productRoutes');
require('./workers/productSyncWorker'); // Initialize worker

const app = express();
app.use(express.json());

app.use('/api/products', productRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Product sync worker is active and listening for jobs');
});

// ============================================
// 9. Example Usage - API Request
// ============================================
/*
POST /api/products/sync

Request Body:
{
  "productData": {
    "sourceProductId": "12345",
    "title": "Awesome T-Shirt",
    "description": "<p>Best shirt ever</p>",
    "vendor": "Cool Brand",
    "productType": "Apparel",
    "tags": "clothing,tshirt,summer",
    "variants": [
      {
        "price": "29.99",
        "sku": "TSHIRT-001",
        "inventory": 100,
        "weight": 0.5,
        "weightUnit": "kg"
      }
    ],
    "images": [
      {
        "src": "https://example.com/image.jpg",
        "alt": "Product image"
      }
    ]
  },
  "targetStores": [
    {
      "domain": "store1.myshopify.com",
      "accessToken": "shpat_xxxxx"
    },
    {
      "domain": "store2.myshopify.com",
      "accessToken": "shpat_yyyyy"
    }
  ],
  "sourceStore": "main-store.myshopify.com"
}

Response:
{
  "success": true,
  "message": "Product sync job added to queue",
  "jobId": "sync-12345-1704672000000",
  "estimatedTime": "4 seconds"
}

---

GET /api/products/sync/status/:jobId

Response:
{
  "success": true,
  "job": {
    "id": "sync-12345-1704672000000",
    "state": "completed",
    "progress": "100%",
    "result": {
      "successful": [
        {
          "store": "store1.myshopify.com",
          "productId": "98765",
          "productHandle": "awesome-t-shirt"
        }
      ],
      "failed": [],
      "totalStores": 2
    }
  }
}
*/




// Real-time Job Monitoring with Socket.IO


// ============================================
// Installation Required
// ============================================
// npm install socket.io socket.io-client

// ============================================
// 1. Socket.IO Server Setup
// ============================================
// server.js
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { QueueEvents } = require('bullmq');
const { redisConnection } = require('./config/redis');
const productRoutes = require('./routes/productRoutes');
require('./workers/productSyncWorker');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3001',
    methods: ['GET', 'POST'],
  },
});

app.use(express.json());
app.use('/api/products', productRoutes);

// ============================================
// 2. Queue Events Listener
// ============================================
const queueEvents = new QueueEvents('product-sync', {
  connection: redisConnection,
});

// Store active socket connections by jobId
const activeConnections = new Map();

// Listen to queue events and emit to connected clients
queueEvents.on('waiting', ({ jobId }) => {
  console.log(`Job ${jobId} is waiting`);
  emitToJob(jobId, 'job:waiting', { jobId, status: 'waiting' });
});

queueEvents.on('active', ({ jobId }) => {
  console.log(`Job ${jobId} is now active`);
  emitToJob(jobId, 'job:active', { jobId, status: 'active' });
});

queueEvents.on('progress', ({ jobId, data }) => {
  console.log(`Job ${jobId} progress: ${data}%`);
  emitToJob(jobId, 'job:progress', { 
    jobId, 
    status: 'active',
    progress: data 
  });
});

queueEvents.on('completed', async ({ jobId, returnvalue }) => {
  console.log(`Job ${jobId} completed`);
  emitToJob(jobId, 'job:completed', { 
    jobId, 
    status: 'completed',
    result: returnvalue 
  });
  
  // Clean up connection after 5 seconds
  setTimeout(() => {
    activeConnections.delete(jobId);
  }, 5000);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.log(`Job ${jobId} failed: ${failedReason}`);
  emitToJob(jobId, 'job:failed', { 
    jobId, 
    status: 'failed',
    error: failedReason 
  });
  
  // Clean up connection after 5 seconds
  setTimeout(() => {
    activeConnections.delete(jobId);
  }, 5000);
});

// Helper function to emit to specific job subscribers
function emitToJob(jobId, event, data) {
  const sockets = activeConnections.get(jobId);
  if (sockets && sockets.size > 0) {
    sockets.forEach(socketId => {
      io.to(socketId).emit(event, data);
    });
  }
}

// ============================================
// 3. Socket.IO Connection Handler
// ============================================
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Client subscribes to job updates
  socket.on('subscribe:job', (jobId) => {
    console.log(`Socket ${socket.id} subscribing to job ${jobId}`);
    
    if (!activeConnections.has(jobId)) {
      activeConnections.set(jobId, new Set());
    }
    activeConnections.get(jobId).add(socket.id);
    
    socket.emit('subscribed', { jobId, message: 'Successfully subscribed to job updates' });
  });

  // Client unsubscribes from job updates
  socket.on('unsubscribe:job', (jobId) => {
    console.log(`Socket ${socket.id} unsubscribing from job ${jobId}`);
    
    const sockets = activeConnections.get(jobId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        activeConnections.delete(jobId);
      }
    }
    
    socket.emit('unsubscribed', { jobId });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    // Remove socket from all job subscriptions
    activeConnections.forEach((sockets, jobId) => {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        activeConnections.delete(jobId);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Socket.IO server ready for real-time updates');
  console.log('Product sync worker is active');
});

// ============================================
// 4. React Client Component Example
// ============================================
/*
// Install on client side:
// npm install socket.io-client axios

import React, { useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

const ProductSyncMonitor = () => {
  const [socket, setSocket] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState({
    status: 'idle',
    progress: 0,
    result: null,
    error: null,
  });
  const [isLoading, setIsLoading] = useState(false);

  // Initialize Socket.IO connection
  useEffect(() => {
    const newSocket = io('http://localhost:3000');
    
    newSocket.on('connect', () => {
      console.log('Connected to server');
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  // Subscribe to job updates
  useEffect(() => {
    if (!socket || !jobId) return;

    socket.emit('subscribe:job', jobId);

    socket.on('subscribed', (data) => {
      console.log('Subscribed to job:', data);
    });

    socket.on('job:waiting', (data) => {
      setJobStatus({ status: 'waiting', progress: 0 });
    });

    socket.on('job:active', (data) => {
      setJobStatus({ status: 'active', progress: 0 });
    });

    socket.on('job:progress', (data) => {
      setJobStatus({ status: 'active', progress: data.progress });
    });

    socket.on('job:completed', (data) => {
      setJobStatus({ 
        status: 'completed', 
        progress: 100, 
        result: data.result 
      });
      setIsLoading(false);
    });

    socket.on('job:failed', (data) => {
      setJobStatus({ 
        status: 'failed', 
        progress: 0, 
        error: data.error 
      });
      setIsLoading(false);
    });

    return () => {
      if (socket && jobId) {
        socket.emit('unsubscribe:job', jobId);
        socket.off('subscribed');
        socket.off('job:waiting');
        socket.off('job:active');
        socket.off('job:progress');
        socket.off('job:completed');
        socket.off('job:failed');
      }
    };
  }, [socket, jobId]);

  // Start product sync
  const startSync = async () => {
    setIsLoading(true);
    setJobStatus({ status: 'initiating', progress: 0 });

    try {
      const response = await axios.post('http://localhost:3000/api/products/sync', {
        productData: {
          sourceProductId: '12345',
          title: 'Awesome T-Shirt',
          description: '<p>Best shirt ever</p>',
          vendor: 'Cool Brand',
          productType: 'Apparel',
          tags: 'clothing,tshirt,summer',
          variants: [
            {
              price: '29.99',
              sku: 'TSHIRT-001',
              inventory: 100,
            }
          ],
        },
        targetStores: [
          { domain: 'store1.myshopify.com', accessToken: 'token1' },
          { domain: 'store2.myshopify.com', accessToken: 'token2' },
          { domain: 'store3.myshopify.com', accessToken: 'token3' },
        ],
        sourceStore: 'main-store.myshopify.com',
      });

      setJobId(response.data.jobId);
      
    } catch (error) {
      console.error('Error starting sync:', error);
      setJobStatus({ 
        status: 'failed', 
        error: error.message 
      });
      setIsLoading(false);
    }
  };

  const getStatusColor = () => {
    switch (jobStatus.status) {
      case 'completed': return 'green';
      case 'failed': return 'red';
      case 'active': return 'blue';
      case 'waiting': return 'orange';
      default: return 'gray';
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Shopify Multistore Product Sync</h1>
      
      <button 
        onClick={startSync} 
        disabled={isLoading}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: isLoading ? '#ccc' : '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: isLoading ? 'not-allowed' : 'pointer',
        }}
      >
        {isLoading ? 'Syncing...' : 'Start Sync'}
      </button>

      {jobId && (
        <div style={{ marginTop: '20px' }}>
          <h3>Job ID: {jobId}</h3>
          
          <div style={{ 
            padding: '15px', 
            backgroundColor: '#f5f5f5', 
            borderRadius: '5px',
            marginTop: '10px',
          }}>
            <div style={{ marginBottom: '10px' }}>
              <strong>Status: </strong>
              <span style={{ 
                color: getStatusColor(),
                fontWeight: 'bold',
                textTransform: 'uppercase'
              }}>
                {jobStatus.status}
              </span>
            </div>

            {jobStatus.status === 'active' && (
              <div style={{ marginBottom: '10px' }}>
                <strong>Progress: </strong>
                <div style={{
                  width: '100%',
                  height: '20px',
                  backgroundColor: '#e0e0e0',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  marginTop: '5px',
                }}>
                  <div style={{
                    width: `${jobStatus.progress}%`,
                    height: '100%',
                    backgroundColor: '#4CAF50',
                    transition: 'width 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 'bold',
                  }}>
                    {jobStatus.progress}%
                  </div>
                </div>
              </div>
            )}

            {jobStatus.result && (
              <div style={{ marginTop: '15px' }}>
                <h4>Results:</h4>
                <p>✓ Successful: {jobStatus.result.successful.length}</p>
                <p>✗ Failed: {jobStatus.result.failed.length}</p>
                
                {jobStatus.result.successful.length > 0 && (
                  <details style={{ marginTop: '10px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                      Successful Syncs
                    </summary>
                    <ul>
                      {jobStatus.result.successful.map((item, idx) => (
                        <li key={idx}>
                          {item.store} - Product ID: {item.productId}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {jobStatus.result.failed.length > 0 && (
                  <details style={{ marginTop: '10px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: 'red' }}>
                      Failed Syncs
                    </summary>
                    <ul>
                      {jobStatus.result.failed.map((item, idx) => (
                        <li key={idx} style={{ color: 'red' }}>
                          {item.store}: {item.error}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            {jobStatus.error && (
              <div style={{ 
                color: 'red', 
                marginTop: '10px',
                padding: '10px',
                backgroundColor: '#ffe6e6',
                borderRadius: '5px',
              }}>
                <strong>Error: </strong>{jobStatus.error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductSyncMonitor;
*/

// ============================================
// 5. Advanced: Bulk Sync with Queue Management
// ============================================
// controllers/bulkSyncController.js
const { productSyncQueue } = require('../queues/productSyncQueue');

const bulkSyncProducts = async (req, res) => {
  try {
    const { products, targetStores, sourceStore } = req.body;

    if (!products || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Products array is required',
      });
    }

    const jobIds = [];

    // Add all products to queue
    for (const product of products) {
      const job = await productSyncQueue.add(
        'sync-product',
        {
          productData: product,
          targetStores,
          sourceStore,
        },
        {
          jobId: `sync-${product.sourceProductId}-${Date.now()}`,
          priority: product.priority || 5,
        }
      );

      jobIds.push(job.id);
    }

    res.status(202).json({
      success: true,
      message: `${products.length} products queued for sync`,
      jobIds,
      totalProducts: products.length,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to queue bulk sync',
      error: error.message,
    });
  }
};

module.exports = { bulkSyncProducts };



// Production Configuration & Monitoring



// ============================================
// 1. Environment Configuration
// ============================================
// .env
/*
NODE_ENV=production
PORT=3000

# Redis Configuration
REDIS_HOST=your-redis-host.com
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_TLS=true

# Shopify Configuration
SHOPIFY_API_VERSION=2024-01

# Queue Configuration
QUEUE_CONCURRENCY=5
QUEUE_MAX_JOBS_PER_SECOND=10
QUEUE_RETRY_ATTEMPTS=3
QUEUE_RETRY_DELAY=2000

# Socket.IO
CLIENT_URL=https://your-frontend.com

# Bull Board (Optional - for monitoring)
BULL_BOARD_USERNAME=admin
BULL_BOARD_PASSWORD=secure-password
*/

// ============================================
// 2. Enhanced Redis Configuration with Retry Logic
// ============================================
// config/redis.js
const Redis = require('ioredis');

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
};

// Add TLS for production
if (process.env.REDIS_TLS === 'true') {
  redisConfig.tls = {
    rejectUnauthorized: false,
  };
}

const redisConnection = new Redis(redisConfig);

redisConnection.on('connect', () => {
  console.log('✓ Redis connected successfully');
});

redisConnection.on('error', (err) => {
  console.error('✗ Redis connection error:', err);
});

redisConnection.on('ready', () => {
  console.log('✓ Redis ready to accept commands');
});

module.exports = { redisConnection, redisConfig };

// ============================================
// 3. Bull Board - Visual Queue Monitoring
// ============================================
// Install: npm install @bull-board/express @bull-board/api
// monitoring/bullBoard.js
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { productSyncQueue } = require('../queues/productSyncQueue');

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(productSyncQueue)
  ],
  serverAdapter: serverAdapter,
});

// Basic Authentication Middleware
const basicAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  
  if (!auth) {
    res.set('WWW-Authenticate', 'Basic realm="Queue Dashboard"');
    return res.status(401).send('Authentication required');
  }

  const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
  const username = credentials[0];
  const password = credentials[1];

  if (
    username === process.env.BULL_BOARD_USERNAME &&
    password === process.env.BULL_BOARD_PASSWORD
  ) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Queue Dashboard"');
  return res.status(401).send('Invalid credentials');
};

module.exports = { serverAdapter, basicAuth };

// ============================================
// 4. Queue Health Check & Metrics
// ============================================
// services/queueMetrics.js
const { productSyncQueue } = require('../queues/productSyncQueue');

class QueueMetrics {
  async getQueueStats() {
    try {
      const [
        waitingCount,
        activeCount,
        completedCount,
        failedCount,
        delayedCount,
      ] = await Promise.all([
        productSyncQueue.getWaitingCount(),
        productSyncQueue.getActiveCount(),
        productSyncQueue.getCompletedCount(),
        productSyncQueue.getFailedCount(),
        productSyncQueue.getDelayedCount(),
      ]);

      return {
        waiting: waitingCount,
        active: activeCount,
        completed: completedCount,
        failed: failedCount,
        delayed: delayedCount,
        total: waitingCount + activeCount + delayedCount,
      };
    } catch (error) {
      console.error('Error getting queue stats:', error);
      throw error;
    }
  }

  async getQueueHealth() {
    try {
      const stats = await this.getQueueStats();
      const isPaused = await productSyncQueue.isPaused();
      
      let health = 'healthy';
      let issues = [];

      // Check if queue is paused
      if (isPaused) {
        health = 'warning';
        issues.push('Queue is paused');
      }

      // Check for high failure rate
      if (stats.failed > stats.completed * 0.1) {
        health = 'warning';
        issues.push('High failure rate detected');
      }

      // Check for stalled jobs
      if (stats.waiting > 1000) {
        health = 'warning';
        issues.push('Large backlog of waiting jobs');
      }

      return {
        status: health,
        stats,
        isPaused,
        issues,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getRecentJobs(count = 10) {
    try {
      const [completed, failed] = await Promise.all([
        productSyncQueue.getCompleted(0, count - 1),
        productSyncQueue.getFailed(0, count - 1),
      ]);

      return {
        completed: completed.map(job => ({
          id: job.id,
          data: job.data,
          result: job.returnvalue,
          completedOn: job.finishedOn,
        })),
        failed: failed.map(job => ({
          id: job.id,
          data: job.data,
          error: job.failedReason,
          failedOn: job.finishedOn,
        })),
      };
    } catch (error) {
      console.error('Error getting recent jobs:', error);
      throw error;
    }
  }

  async cleanupOldJobs() {
    try {
      // Clean completed jobs older than 7 days
      await productSyncQueue.clean(7 * 24 * 3600 * 1000, 100, 'completed');
      
      // Clean failed jobs older than 30 days
      await productSyncQueue.clean(30 * 24 * 3600 * 1000, 100, 'failed');

      console.log('✓ Old jobs cleaned up successfully');
    } catch (error) {
      console.error('✗ Error cleaning up old jobs:', error);
    }
  }
}

module.exports = new QueueMetrics();

// ============================================
// 5. Health Check & Metrics API Endpoints
// ============================================
// routes/metricsRoutes.js
const express = require('express');
const router = express.Router();
const queueMetrics = require('../services/queueMetrics');

// Get queue statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await queueMetrics.getQueueStats();
    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get queue health
router.get('/health', async (req, res) => {
  try {
    const health = await queueMetrics.getQueueHealth();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json({
      success: health.status === 'healthy',
      health,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get recent jobs
router.get('/recent-jobs', async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 10;
    const jobs = await queueMetrics.getRecentJobs(count);
    
    res.json({
      success: true,
      jobs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Manual cleanup trigger
router.post('/cleanup', async (req, res) => {
  try {
    await queueMetrics.cleanupOldJobs();
    res.json({
      success: true,
      message: 'Cleanup completed successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;

// ============================================
// 6. Error Handling & Logging
// ============================================
// utils/logger.js
const winston = require('winston');

// Install: npm install winston

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'product-sync-queue' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}

module.exports = logger;

// ============================================
// 7. Updated Worker with Logging
// ============================================
// workers/productSyncWorker.js (Enhanced)
const { Worker } = require('bullmq');
const { redisConnection } = require('../config/redis');
const logger = require('../utils/logger');

const productSyncWorker = new Worker(
  'product-sync',
  async (job) => {
    const startTime = Date.now();
    logger.info(`Starting job ${job.id}`, { 
      jobId: job.id, 
      productId: job.data.productData.sourceProductId 
    });

    try {
      const { productData, targetStores, sourceStore } = job.data;
      const results = {
        successful: [],
        failed: [],
        totalStores: targetStores.length,
      };

      await job.updateProgress(0);

      for (let i = 0; i < targetStores.length; i++) {
        const store = targetStores[i];
        
        try {
          // Your Shopify sync logic here
          logger.info(`Syncing to store: ${store.domain}`, { 
            jobId: job.id, 
            store: store.domain 
          });

          // Simulate API call
          await new Promise(resolve => setTimeout(resolve, 1000));

          results.successful.push({
            store: store.domain,
            productId: `mock-${Date.now()}`,
          });

          logger.info(`Successfully synced to ${store.domain}`, { 
            jobId: job.id, 
            store: store.domain 
          });
          
        } catch (error) {
          logger.error(`Failed to sync to ${store.domain}`, { 
            jobId: job.id, 
            store: store.domain,
            error: error.message,
            stack: error.stack,
          });

          results.failed.push({
            store: store.domain,
            error: error.message,
          });
        }

        const progress = Math.round(((i + 1) / targetStores.length) * 100);
        await job.updateProgress(progress);
      }

      const duration = Date.now() - startTime;
      logger.info(`Job ${job.id} completed in ${duration}ms`, { 
        jobId: job.id,
        duration,
        successful: results.successful.length,
        failed: results.failed.length,
      });

      return results;
      
    } catch (error) {
      logger.error(`Job ${job.id} failed`, { 
        jobId: job.id,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY) || 5,
    limiter: {
      max: parseInt(process.env.QUEUE_MAX_JOBS_PER_SECOND) || 10,
      duration: 1000,
    },
  }
);

productSyncWorker.on('completed', (job) => {
  logger.info(`Worker completed job ${job.id}`);
});

productSyncWorker.on('failed', (job, err) => {
  logger.error(`Worker failed job ${job.id}`, { 
    error: err.message 
  });
});

module.exports = { productSyncWorker };

// ============================================
// 8. Complete App with All Features
// ============================================
// app.js (Final Version)
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const productRoutes = require('./routes/productRoutes');
const metricsRoutes = require('./routes/metricsRoutes');
const { serverAdapter, basicAuth } = require('./monitoring/bullBoard');
const logger = require('./utils/logger');
const queueMetrics = require('./services/queueMetrics');
require('./workers/productSyncWorker');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(express.json());

// Routes
app.use('/api/products', productRoutes);
app.use('/api/metrics', metricsRoutes);

// Bull Board Dashboard (Protected)
app.use('/admin/queues', basicAuth, serverAdapter.getRouter());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Socket.IO setup (from previous artifact)
// ... your socket.io code here ...

// Schedule periodic cleanup (every 6 hours)
setInterval(() => {
  queueMetrics.cleanupOldJobs();
}, 6 * 60 * 60 * 1000);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { 
    error: err.message, 
    stack: err.stack,
    url: req.url,
  });
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info('Product sync system initialized');
  console.log(`\n📊 Queue Dashboard: http://localhost:${PORT}/admin/queues`);
  console.log(`📈 Metrics API: http://localhost:${PORT}/api/metrics/health\n`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing gracefully');
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// ============================================
// 9. Docker Setup (Optional)
// ============================================
/*
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "app.js"]

---

# docker-compose.yml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - redis
    restart: unless-stopped

volumes:
  redis_data:
*/

// ============================================
// 10. Package.json Scripts
// ============================================
/*
{
  "scripts": {
    "start": "node app.js",
    "dev": "nodemon app.js",
    "worker": "node workers/productSyncWorker.js",
    "test": "jest",
    "lint": "eslint ."
  },
  "dependencies": {
    "express": "^4.18.2",
    "bullmq": "^5.0.0",
    "ioredis": "^5.3.2",
    "socket.io": "^4.6.1",
    "shopify-api-node": "^3.12.5",
    "@bull-board/express": "^5.10.0",
    "@bull-board/api": "^5.10.0",
    "winston": "^3.11.0"
  }
}
*/