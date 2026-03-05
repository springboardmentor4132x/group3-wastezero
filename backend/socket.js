/**
 * Socket.IO server — JWT-authenticated real-time event layer.
 *
 * Exports:
 *   initSocket(httpServer)  — attach Socket.IO to the HTTP server
 *   getIO()                 — get the io instance (for emitting from controllers)
 *   getOnlineUsers()        — Map<userId, Set<socketId>>
 *   emitToUser(userId, event, data)  — send event to a specific user
 *   emitToRoom(room, event, data)    — send event to a room
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');

let io = null;

// userId → Set<socketId>
const onlineUsers = new Map();

// ── Rate-limit helper (per-socket event throttle) ─────────────────────────
function rateLimit(socket, event, windowMs = 1000, max = 5) {
  const key = `_rl_${event}`;
  if (!socket[key]) socket[key] = { count: 0, resetAt: Date.now() + windowMs };
  const bucket = socket[key];
  if (Date.now() > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = Date.now() + windowMs;
  }
  bucket.count++;
  return bucket.count <= max;
}

// ── Initialise ────────────────────────────────────────────────────────────
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: ['http://localhost:4200', 'http://localhost:3000'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 60000,
    transports: ['websocket', 'polling'],
  });

  // ── JWT authentication middleware ─────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password').lean();
      if (!user) return next(new Error('User not found'));
      if (user.isSuspended) return next(new Error('Account suspended'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  // ── Connection handler ────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    const role = socket.user.role;

    // Track online users
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);

    // Join personal room
    socket.join(`user:${userId}`);
    socket.join(`role:${role}`);

    console.log(`⚡ Socket connected: ${socket.user.name} (${role}) [${socket.id}]`);

    // ── Chat: send message (real-time relay) ────────────────────────────
    socket.on('chat:send', (data) => {
      if (!rateLimit(socket, 'chat:send', 2000, 10)) return;
      // Relay handled by REST controller — this just forwards if needed
      // In our arch the REST POST /api/messages saves + emits via emitToUser
    });

    // ── Chat: typing indicator ──────────────────────────────────────────
    socket.on('chat:typing', (data) => {
      if (!rateLimit(socket, 'chat:typing', 1000, 3)) return;
      if (!data?.receiverId) return;
      emitToUser(data.receiverId, 'chat:typing', {
        senderId: userId,
        senderName: socket.user.name,
        typing: data.typing !== false,
      });
    });

    // ── Search: real-time presence ──────────────────────────────────────
    socket.on('opportunity:join', (oppId) => {
      if (oppId) socket.join(`opportunity:${oppId}`);
    });
    socket.on('opportunity:leave', (oppId) => {
      if (oppId) socket.leave(`opportunity:${oppId}`);
    });

    // ── Disconnect ──────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) onlineUsers.delete(userId);
      }
      console.log(`⚡ Socket disconnected: ${socket.user.name} [${socket.id}]`);
    });
  });

  return io;
}

// ── Public helpers ────────────────────────────────────────────────────────
function getIO() {
  if (!io) throw new Error('Socket.IO not initialised — call initSocket first');
  return io;
}

function getOnlineUsers() {
  return onlineUsers;
}

/** Emit an event to a specific user (all their connected sockets) */
function emitToUser(userId, event, data) {
  if (!io) return;
  io.to(`user:${userId.toString()}`).emit(event, data);
}

/** Emit an event to a room */
function emitToRoom(room, event, data) {
  if (!io) return;
  io.to(room).emit(event, data);
}

module.exports = { initSocket, getIO, getOnlineUsers, emitToUser, emitToRoom };
