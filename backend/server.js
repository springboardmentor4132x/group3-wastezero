require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const compression = require('compression');
const connectDB = require('./config/db');
const { initSocket, getOnlineUsers } = require('./socket');
const { corsOriginHandler, getAllowedOrigins } = require('./config/cors');

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);
const isVercel = Boolean(process.env.VERCEL);

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
  res.json({ status: 'OK', message: 'WasteZero API is running', timestamp: new Date() });
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

if (require.main === module) {
  // Only listen when run directly (not when require()'d by tests)
  server.listen(PORT, () => {
    console.log(`WasteZero Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Allowed origins: ${getAllowedOrigins().join(', ')}`);
    console.log(isVercel ? 'Socket.IO disabled on Vercel/serverless runtime' : 'Socket.IO ready for connections');
  });
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
}

module.exports = app;
module.exports.server = server;
