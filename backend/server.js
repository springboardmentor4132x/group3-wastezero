require('dotenv').config();
const dns = require('dns');
const express = require('express');
const http = require('http');
const https = require('https');
const cors = require('cors');
const compression = require('compression');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { initSocket, getOnlineUsers } = require('./socket');
const { corsOriginHandler, getAllowedOrigins } = require('./config/cors');
const isVercel = Boolean(process.env.VERCEL);

if (typeof dns.setDefaultResultOrder === 'function') {
  const desiredOrder = process.env.DNS_RESULT_ORDER
    || ((process.env.SMTP_IP_FAMILY || '4') === '4' ? 'ipv4first' : undefined);
  if (desiredOrder) {
    try {
      dns.setDefaultResultOrder(desiredOrder);
    } catch (error) {
      console.warn(`Unable to set DNS result order (${desiredOrder}): ${error.message}`);
    }
  }
}

// Connect to MongoDB
connectDB().catch((error) => {
  console.error(`Initial DB connection failed: ${error.message}`);
  if (!isVercel) {
    process.exit(1);
  }
});

const app = express();
const server = http.createServer(app);

// Initialise Socket.IO on the HTTP server
if (!isVercel) {
  initSocket(server);
}

// ── Performance Middleware ─────────────────────────────────────────────────
// Gzip/deflate all responses > 1KB
app.use(compression({ threshold: 1024 }));

// Middleware
app.use(cors({
  origin: corsOriginHandler,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.set('trust proxy', 1);

// Fast-fail when DB is unavailable to avoid Mongoose buffering timeouts per route.
app.use(async (req, res, next) => {
  if (req.method === 'OPTIONS' || req.path === '/api/health' || req.path === '/api/keepalive') {
    return next();
  }

  if (mongoose.connection.readyState === 1) {
    return next();
  }

  try {
    await connectDB();
    return next();
  } catch (_err) {
    return res.status(503).json({ message: 'Database unavailable. Please try again shortly.' });
  }
});

// Cache-Control helper — attach to read-only routes
app.use((req, res, next) => {
  if (req.method === 'GET') {
    // Short cache for authenticated API reads (client can revalidate)
    res.set('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');
  } else {
    res.set('Cache-Control', 'no-store');
  }
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/pickups', require('./routes/pickups'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/opportunities', require('./routes/opportunities'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/search', require('./routes/search'));
app.use('/api/support', require('./routes/support'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/banners', require('./routes/banners'));

// Health check — no cache
app.get('/api/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const state = mongoose.connection.readyState;
  const dbConnected = state === 1;
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'OK' : 'DEGRADED',
    dbConnected,
    message: dbConnected
      ? 'WasteZero API is running'
      : 'WasteZero API is running but database is unavailable',
    timestamp: new Date(),
  });
});

// Uptime monitor keepalive endpoint
app.get('/api/keepalive', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    status: 'alive',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date(),
    onlineUsers: getOnlineUsers().size,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found` });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return String(value).toLowerCase() === 'true';
}

function pingUrl(url) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      return reject(error);
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(parsed, {
      method: 'GET',
      timeout: 10000,
      headers: {
        'User-Agent': 'wastezero-self-ping/1.0',
      },
    }, (res) => {
      // Drain data to free socket resources.
      res.resume();
      resolve(res.statusCode || 0);
    });

    req.on('timeout', () => {
      req.destroy(new Error('Self-ping request timed out'));
    });

    req.on('error', reject);
    req.end();
  });
}

function startSelfPingScheduler(port) {
  const defaultEnabled = !isVercel && process.env.NODE_ENV === 'production';
  const enabled = parseBoolean(process.env.SELF_PING_ENABLED, defaultEnabled);
  if (!enabled) {
    return null;
  }

  const intervalMs = parsePositiveInt(process.env.SELF_PING_INTERVAL_MS, 30000);
  const pingUrlTarget = process.env.SELF_PING_URL || `http://127.0.0.1:${port}/api/keepalive`;

  const pingOnce = async () => {
    try {
      const statusCode = await pingUrl(pingUrlTarget);
      if (statusCode >= 400 || statusCode === 0) {
        console.warn(`Self-ping responded with status ${statusCode}`);
      }
    } catch (error) {
      console.warn(`Self-ping failed: ${error.message}`);
    }
  };

  // Prime a first ping shortly after startup, then continue on interval.
  setTimeout(() => {
    void pingOnce();
  }, 5000);

  const timer = setInterval(() => {
    void pingOnce();
  }, intervalMs);

  console.log(`Self-ping scheduler enabled (${intervalMs}ms) -> ${pingUrlTarget}`);
  return timer;
}

if (require.main === module) {
  // Only listen when run directly (not when require()'d by tests)
  server.listen(PORT, () => {
    console.log(`WasteZero Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Allowed origins: ${getAllowedOrigins().join(', ')}`);
    console.log(isVercel ? 'Socket.IO disabled on Vercel/serverless runtime' : 'Socket.IO ready for connections');
    startSelfPingScheduler(PORT);
  });
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
}

module.exports = app;
module.exports.server = server;
