// ==============================
// 1. Initialize Datadog FIRST
// ==============================
const { tracer, logger } = require('./datadog');

// ==============================
// 2. Core imports
// ==============================
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// ==============================
// 3. AWS Secrets Manager setup
// ==============================
const {
  SecretsManagerClient,
  GetSecretValueCommand
} = require("@aws-sdk/client-secrets-manager");

const client = new SecretsManagerClient({
  region: process.env.AWS_REGION || "us-east-1"
});

// ==============================
// 4. Express app init
// ==============================
const app = express();

// ==============================
// 5. Middleware
// ==============================
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });

  next();
});

// ==============================
// 6. Get Mongo Secret from AWS
// ==============================
async function getMongoSecret() {
  const response = await client.send(
    new GetSecretValueCommand({
      SecretId: process.env.SECRET_ID || "fitness-secrets"
    })
  );

  return JSON.parse(response.SecretString);
}

// ==============================
// 7. MongoDB connection logic
// ==============================
let isConnected = false;

async function connectDB() {
  try {
    if (isConnected) return;

    const secret = await getMongoSecret();

    const mongoURI =
      `mongodb://${secret.host}:${secret.port}/${secret.database}`;

    await mongoose.connect(mongoURI);

    isConnected = true;

    logger.info('Database connected successfully', {
      host: secret.host,
      database: secret.database
    });

    console.log("✅ MongoDB Connected Successfully");

  } catch (error) {
    logger.error('MongoDB connection failed', {
      error: error.message
    });

    console.error("❌ MongoDB Connection Failed:", error.message);

    // retry after 5 seconds
    setTimeout(connectDB, 5000);
  }
}

// Initialize DB connection
connectDB();

// ==============================
// 8. Routes
// ==============================

// Root route
app.get('/', (req, res) => {
  res.sendFile(
    path.join(__dirname, '..', 'public', 'pages', 'index.html')
  );
});

// Auth routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Debug middleware for auth
app.use('/api/auth', (req, res, next) => {
  logger.info('Auth API hit', {
    method: req.method,
    path: req.path
  });
  next();
});

// Handle 404 for any route not matched by static files or API routes
app.use((req, res) => {
  res.status(404).sendFile(
    path.join(__dirname, '..', 'public', 'pages', '404.html')
  );
});

// ==============================
// 9. Server start
// ==============================
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  logger.info('Server started', {
    host: HOST,
    port: PORT,
    env: process.env.NODE_ENV || 'development'
  });

  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
});
