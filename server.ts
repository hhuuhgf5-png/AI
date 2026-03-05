import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import fs from 'fs';
import admin from 'firebase-admin';
import { GoogleGenAI, Type, Modality } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: admin.firestore.Firestore | null = null;
let genAI: GoogleGenAI | null = null;

function getDb() {
  if (!db) {
    try {
      // In AI Studio, initializeApp() without arguments is the most reliable
      // as it uses the ambient service account and project ID.
      if (!admin.apps.length) {
        admin.initializeApp();
        console.log("Firebase Admin initialized with default credentials");
      }
      
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const dbId = config.firestoreDatabaseId;
        
        // Check if the projectId in config matches the one we initialized with
        // If not, we should probably stick to the default project's firestore
        const currentProjectId = admin.app().options.projectId;
        if (config.projectId && currentProjectId && config.projectId !== currentProjectId) {
          console.warn(`Config project ID (${config.projectId}) mismatch with environment (${currentProjectId}). Using environment default.`);
          db = admin.firestore();
        } else if (dbId && dbId !== '(default)') {
          db = admin.firestore(dbId);
          console.log(`Firebase Admin using named database: ${dbId}`);
        } else {
          db = admin.firestore();
          console.log("Firebase Admin using default database");
        }
      } else {
        db = admin.firestore();
        console.log("Firebase Admin using default database (no config)");
      }
    } catch (error: any) {
      console.error("Firebase Admin initialization error:", error.message);
      if (!admin.apps.length) {
        try { admin.initializeApp(); } catch(e) {}
      }
      db = admin.firestore();
    }
  }
  return db;
}

// Helper to handle Firestore operations with fallback
async function withFirestoreFallback<T>(operation: (firestore: admin.firestore.Firestore) => Promise<T>): Promise<T> {
  let firestore = getDb();
  if (!firestore) throw new Error('Database not available');

  try {
    return await operation(firestore);
  } catch (error: any) {
    console.error("Firestore operation error:", error.code, error.message);
    // If it's a permission error and we were using a named database, try falling back to default
    if ((error.code === 7 || error.message.includes('permission')) && firestore.databaseId !== '(default)') {
      console.warn("Permission denied on named database, falling back to default database...");
      db = admin.firestore(); // Update global db to default
      return await operation(db);
    }
    throw error;
  }
}

function getGenAI() {
  if (!genAI) {
    const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY_1 || '';
    if (apiKey) {
      genAI = new GoogleGenAI({ apiKey });
    }
  }
  return genAI;
}

async function startServer() {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  const checkAndIncrementUsage = async (uid: string, type: 'message' | 'audio', amount: number = 1) => {
    const firestore = getDb();
    if (!firestore) throw new Error('خدمة قاعدة البيانات غير متوفرة حالياً');
    
    const usage = await getUsage(uid);
    const docRef = firestore.collection('usage').doc(uid);

    if (type === 'message') {
      if (usage.messagesUsed >= 10) throw new Error('تجاوزت حد الرسائل اليومي (١٠ رسائل)');
      await docRef.update({ messagesUsed: admin.firestore.FieldValue.increment(1) });
    } else {
      if (usage.audioSecondsUsed >= 300) throw new Error('تجاوزت حد الصوت اليومي (٥ دقائق)');
      await docRef.update({ audioSecondsUsed: admin.firestore.FieldValue.increment(amount) });
    }
    return await getUsage(uid);
  };

  // Gemini API Endpoints
  app.post('/api/ai/assistant', async (req, res) => {
    const { uid, prompt } = req.body;
    try {
      const ai = getGenAI();
      if (!ai) throw new Error('خدمة الذكاء الاصطناعي غير متوفرة حالياً');
      
      await checkAndIncrementUsage(uid, 'message');
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: prompt
      });
      res.json({ text: response.text, usage: await getUsage(uid) });
    } catch (error: any) {
      res.status(error.message.includes('تجاوزت') ? 403 : 500).json({ error: error.message });
    }
  });

  app.post('/api/ai/tts', async (req, res) => {
    const { uid, text, voiceName, dialectInstruction } = req.body;
    try {
      const ai = getGenAI();
      if (!ai) throw new Error('خدمة الذكاء الاصطناعي غير متوفرة حالياً');

      const wordCount = text.split(/\s+/).length;
      const estimatedSeconds = Math.ceil(wordCount / 2.5);
      await checkAndIncrementUsage(uid, 'audio', estimatedSeconds);

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: [{ parts: [{ text: `${dialectInstruction}\n\nالنص: ${text}` }] }],
        config: {
          responseModalities: ["AUDIO" as any],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } }
          } as any
        } as any
      });
      
      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      res.json({ audio: audioData, usage: await getUsage(uid) });
    } catch (error: any) {
      res.status(error.message.includes('تجاوزت') ? 403 : 500).json({ error: error.message });
    }
  });

  app.post('/api/ai/flashcards', async (req, res) => {
    const { uid, text, count } = req.body;
    try {
      const ai = getGenAI();
      if (!ai) throw new Error('خدمة الذكاء الاصطناعي غير متوفرة حالياً');

      await checkAndIncrementUsage(uid, 'message');
      const response = await ai.models.generateContent({ 
        model: "gemini-2.0-flash-exp",
        contents: `استخرج أهم ${count} مصطلحات من النص ده واعملهم في شكل (سؤال وإجابة) بتنسيق JSON.\nالنص: ${text}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                definition: { type: Type.STRING }
              },
              required: ["term", "definition"]
            }
          }
        }
      });
      res.json({ cards: JSON.parse(response.text || '[]'), usage: await getUsage(uid) });
    } catch (error: any) {
      res.status(error.message.includes('تجاوزت') ? 403 : 500).json({ error: error.message });
    }
  });

  // Usage Logic
  const getUsage = async (uid: string) => {
    const today = new Date().toISOString().split('T')[0];
    
    return await withFirestoreFallback(async (firestore) => {
      const docRef = firestore.collection('usage').doc(uid);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        const initialUsage = {
          messagesUsed: 0,
          audioSecondsUsed: 0,
          lastResetDate: today
        };
        await docRef.set(initialUsage);
        return initialUsage;
      }

      const data = doc.data() as any;
      if (data.lastResetDate !== today) {
        const resetUsage = {
          messagesUsed: 0,
          audioSecondsUsed: 0,
          lastResetDate: today
        };
        await docRef.set(resetUsage, { merge: true });
        return resetUsage;
      }

      return data;
    });
  };

  app.post('/api/usage', async (req, res) => {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: 'UID required' });
    try {
      const usage = await getUsage(uid);
      res.json(usage);
    } catch (error: any) {
      console.error("Usage fetch error details:", {
        message: error.message,
        code: error.code,
        details: error.details
      });
      res.status(500).json({ error: `فشل جلب الاستهلاك: ${error.message}` });
    }
  });

  app.post('/api/usage/update', async (req, res) => {
    const { uid, type, amount } = req.body;
    if (!uid) return res.status(400).json({ error: 'UID required' });
    
    try {
      const usage = await getUsage(uid);
      
      const updateData: any = {};
      if (type === 'message') {
        if (usage.messagesUsed >= 10) return res.status(403).json({ error: 'تجاوزت حد الرسائل اليومي (١٠ رسائل)' });
        updateData.messagesUsed = admin.firestore.FieldValue.increment(1);
      } else if (type === 'audio') {
        if (usage.audioSecondsUsed >= 300) return res.status(403).json({ error: 'تجاوزت حد الصوت اليومي (٥ دقائق)' });
        updateData.audioSecondsUsed = admin.firestore.FieldValue.increment(amount || 0);
      }
      
      await withFirestoreFallback(async (firestore) => {
        const docRef = firestore.collection('usage').doc(uid);
        await docRef.set(updateData, { merge: true });
      });
      
      const updatedUsage = await getUsage(uid);
      res.json(updatedUsage);
    } catch (error: any) {
      console.error("Usage update error details:", {
        message: error.message,
        code: error.code,
        details: error.details
      });
      const msg = error.code === 7 
        ? "خطأ في صلاحيات قاعدة البيانات (PERMISSION_DENIED). يرجى التأكد من إعدادات Firebase." 
        : `فشل تحديث الاستهلاك: ${error.message}`;
      res.status(500).json({ error: msg });
    }
  });

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

  // Debug route for Firebase
  app.get('/api/debug/firebase', (req, res) => {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    let config: any = null;
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    
    res.json({
      initialized: admin.apps.length > 0,
      currentProjectId: admin.apps.length ? admin.app().options.projectId : null,
      configProjectId: config ? config.projectId : null,
      configDbId: config ? config.firestoreDatabaseId : null,
      envProjectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || 'unknown'
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

  httpServer.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Initialize first
    const firestore = getDb();

    // Debug info to file
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    let config: any = null;
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    const debugInfo = {
      initialized: admin.apps.length > 0,
      currentProjectId: admin.apps.length ? admin.app().options.projectId : null,
      configProjectId: config ? config.projectId : null,
      configDbId: config ? config.firestoreDatabaseId : null,
      envProjectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || 'unknown',
      firebaseConfigEnv: process.env.FIREBASE_CONFIG || 'none'
    };
    fs.writeFileSync(path.join(process.cwd(), 'firebase-debug.json'), JSON.stringify(debugInfo, null, 2));
    
    // Test Firestore connection
    try {
      if (firestore) {
        // Test with the actual collection we use
        await firestore.collection('usage').doc('_ping').set({ 
          timestamp: admin.firestore.FieldValue.serverTimestamp() 
        }, { merge: true });
        console.log("Firestore connection test (usage collection): SUCCESS");
      }
    } catch (error: any) {
      console.error("Firestore connection test: FAILED", error.code, error.message);
      
      // If named database failed, try to force default
      if (error.code === 7 || error.message.includes('permission')) {
        console.log("Attempting to force default database due to permission error...");
        db = admin.firestore();
        try {
          await db.collection('usage').doc('_ping').set({ 
            timestamp: admin.firestore.FieldValue.serverTimestamp() 
          }, { merge: true });
          console.log("Firestore fallback to default database: SUCCESS");
        } catch (e: any) {
          console.error("Firestore fallback to default database: FAILED", e.message);
        }
      }
    }
  });
}

startServer();
