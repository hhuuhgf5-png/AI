import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Export Project Route
  app.get('/api/export', (req, res) => {
    try {
      const zip = new AdmZip();
      const filesToInclude = [
        'App.tsx',
        'audioUtils.ts',
        'geminiService.ts',
        'index.css',
        'index.html',
        'index.tsx',
        'metadata.json',
        'package.json',
        'server.ts',
        'tsconfig.json',
        'types.ts',
        'vite.config.ts',
        '.gitignore'
      ];

      filesToInclude.forEach(file => {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
          zip.addLocalFile(filePath);
        }
      });

      // Include components folder
      const componentsPath = path.join(__dirname, 'components');
      if (fs.existsSync(componentsPath)) {
        zip.addLocalFolder(componentsPath, 'components');
      }

      const zipBuffer = zip.toBuffer();
      res.set('Content-Type', 'application/zip');
      res.set('Content-Disposition', 'attachment; filename=e-learning-ai-hub.zip');
      res.send(zipBuffer);
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).send('Failed to export project');
    }
  });

  // Socket.io Logic
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create-room', () => {
      const roomId = Math.floor(100000 + Math.random() * 900000).toString();
      socket.join(roomId);
      socket.emit('room-created', roomId);
      console.log(`Room created: ${roomId}`);
    });

    socket.on('join-room', (roomId) => {
      const room = io.sockets.adapter.rooms.get(roomId);
      if (room) {
        socket.join(roomId);
        socket.emit('room-joined', roomId);
        io.to(roomId).emit('peer-joined');
        console.log(`User ${socket.id} joined room: ${roomId}`);
      } else {
        socket.emit('error', 'الغرفة غير موجودة. تأكد من الكود.');
      }
    });

    // Syncing events
    socket.on('sync-feature', ({ roomId, feature }) => {
      socket.to(roomId).emit('feature-synced', feature);
    });

    socket.on('sync-analyzer', ({ roomId, data }) => {
      socket.to(roomId).emit('analyzer-synced', data);
    });

    socket.on('direct-message', ({ roomId, message }) => {
      socket.to(roomId).emit('direct-message', message);
    });

    // WebRTC Signaling
    socket.on('call-request', ({ roomId }) => {
      socket.to(roomId).emit('incoming-call');
    });

    socket.on('call-accept', ({ roomId }) => {
      socket.to(roomId).emit('call-accepted');
    });

    socket.on('call-reject', ({ roomId }) => {
      socket.to(roomId).emit('call-rejected');
    });

    socket.on('webrtc-offer', ({ roomId, offer }) => {
      socket.to(roomId).emit('webrtc-offer', offer);
    });

    socket.on('webrtc-answer', ({ roomId, answer }) => {
      socket.to(roomId).emit('webrtc-answer', answer);
    });

    socket.on('webrtc-ice-candidate', ({ roomId, candidate }) => {
      socket.to(roomId).emit('webrtc-ice-candidate', candidate);
    });

    socket.on('end-call', ({ roomId }) => {
      socket.to(roomId).emit('call-ended');
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
