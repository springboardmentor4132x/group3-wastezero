require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const compression = require('compression');
const connectDB = require('./config/db');
const { initSocket } = require('./socket');

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);

// Initialise Socket.IO on the HTTP server
initSocket(server);

// ── Performance Middleware ─────────────────────────────────────────────────
// Gzip/deflate all responses > 1KB
app.use(compression({ threshold: 1024 }));

// Middleware
app.use(cors({
  origin: ['http://localhost:4200', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

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

// Health check — no cache
app.get('/api/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ status: 'OK', message: 'WasteZero API is running', timestamp: new Date() });
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

if (!module.parent) {
  // Only listen when run directly (not when require()'d by tests)
  server.listen(PORT, () => {
    console.log(`WasteZero Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log('Socket.IO ready for connections');
  });
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
}

module.exports = { app, server };
