import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import fs from "fs";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.resolve(process.cwd(), "uploads");
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (err) {
  console.error("Failed to create uploads directory:", err);
}

async function startServer() {
  try {
    const app = express();
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));

    const allowedOrigins = [
      "https://ravenpendragon66-rgb.github.io",
      "https://ravenpendragon66-rgb.github.io/multiplayermusic",
      "http://localhost:5173",
      process.env.CLIENT_ORIGIN
    ].filter(Boolean) as string[];

    app.use((req, res, next) => {
      const origin = req.headers.origin as string | undefined;
      if (origin && allowedOrigins.includes(origin)) {
        res.header("Access-Control-Allow-Origin", origin);
      }
      res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        return res.sendStatus(204);
      }
      next();
    });

    const httpServer = createServer(app);
    const io = new Server(httpServer, {
      cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"]
      }
    });

    const PORT = process.env.PORT || 10000;

    // Logging middleware
    app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
      next();
    });

    app.get("/api/health", (req, res) => {
      res.json({ 
        status: "ok", 
        env: process.env.NODE_ENV, 
        cwd: process.cwd(),
        distExists: fs.existsSync(path.resolve(process.cwd(), "dist"))
      });
    });

    // Room state storage
    const rooms = new Map<string, {
      password?: string;
      currentTrackIndex: number;
      isPlaying: boolean;
      currentTime: number;
      lastUpdated: number;
      users: Set<string>;
      tracks: any[];
    }>();

    const initialTracks = [
      {
        id: "1",
        title: "Midnight City",
        artist: "M83",
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        cover: "https://picsum.photos/seed/m83/400/400"
      },
      {
        id: "2",
        title: "Starlight",
        artist: "Muse",
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
        cover: "https://picsum.photos/seed/muse/400/400"
      },
      {
        id: "3",
        title: "Instant Crush",
        artist: "Daft Punk",
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
        cover: "https://picsum.photos/seed/daft/400/400"
      }
    ];

    const getPublicBaseUrl = (req: any) => {
      const configured = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
      if (configured) return configured;
      const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] || req.protocol || 'http';
      const host = req.get('host');
      return `${proto}://${host}`;
    };

    // Multer config for file uploads
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, uploadsDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
      }
    });
    const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

    io.on("connection", (socket) => {
      socket.on("join-room", ({ roomId, password }: { roomId: string, password?: string }) => {
        if (!rooms.has(roomId)) {
          rooms.set(roomId, {
            password: password,
            currentTrackIndex: 0,
            isPlaying: false,
            currentTime: 0,
            lastUpdated: Date.now(),
            users: new Set(),
            tracks: [...initialTracks]
          });
        }
        
        const room = rooms.get(roomId)!;

        if (room.password && room.password !== password) {
          return socket.emit("join-error", { message: "Senha incorreta para esta sala." });
        }

        socket.join(roomId);
        room.users.add(socket.id);
        
        socket.emit("room-state", {
          trackIndex: room.currentTrackIndex,
          isPlaying: room.isPlaying,
          currentTime: room.currentTime + (room.isPlaying ? (Date.now() - room.lastUpdated) / 1000 : 0),
          userCount: room.users.size,
          tracks: room.tracks
        });

        io.to(roomId).emit("user-joined", { userCount: room.users.size });
      });

      socket.on("play-pause", ({ roomId, isPlaying, currentTime }: { roomId: string, isPlaying: boolean, currentTime: number }) => {
        const room = rooms.get(roomId);
        if (room) {
          room.isPlaying = isPlaying;
          room.currentTime = currentTime;
          room.lastUpdated = Date.now();
          socket.to(roomId).emit("sync-playback", { isPlaying, currentTime });
        }
      });

      socket.on("change-track", ({ roomId, trackIndex }: { roomId: string, trackIndex: number }) => {
        const room = rooms.get(roomId);
        if (room) {
          room.currentTrackIndex = trackIndex;
          room.currentTime = 0;
          room.isPlaying = true;
          room.lastUpdated = Date.now();
          io.to(roomId).emit("track-changed", { trackIndex });
        }
      });

      socket.on("seek", ({ roomId, currentTime }: { roomId: string, currentTime: number }) => {
        const room = rooms.get(roomId);
        if (room) {
          room.currentTime = currentTime;
          room.lastUpdated = Date.now();
          socket.to(roomId).emit("sync-seek", { currentTime });
        }
      });

      socket.on("disconnecting", () => {
        for (const roomId of socket.rooms) {
          const room = rooms.get(roomId);
          if (room) {
            room.users.delete(socket.id);
            io.to(roomId).emit("user-left", { userCount: room.users.size });
          }
        }
      });
    });

    // API routes
    app.use("/uploads", express.static(uploadsDir));

    app.post("/api/upload", upload.single("audio"), (req, res) => {
      const { roomId, title, artist } = req.body;
      if (!req.file || !roomId) {
        return res.status(400).json({ error: "Missing file or roomId" });
      }

      const room = rooms.get(roomId);
      if (!room) return res.status(404).json({ error: "Room not found" });

      const newTrack = {
        id: Date.now().toString(),
        title: title || req.file.originalname,
        artist: artist || "Unknown Artist",
        url: `${getPublicBaseUrl(req)}/uploads/${req.file.filename}`,
        cover: `https://picsum.photos/seed/${req.file.filename}/400/400`
      };

      room.tracks.push(newTrack);
      io.to(roomId).emit("new-track-added", { track: newTrack, tracks: room.tracks });
      res.json(newTrack);
    });

    // Serve frontend
    const distPath = path.resolve(process.cwd(), "dist");
    const isProduction = process.env.NODE_ENV === "production" || fs.existsSync(distPath);

    if (isProduction && fs.existsSync(distPath)) {
      console.log("Serving production build from:", distPath);
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        // Don't fallback for API or uploads
        if (req.url.startsWith("/api") || req.url.startsWith("/uploads") || req.url.startsWith("/socket.io")) {
          return res.status(404).json({ error: "Not found" });
        }
        res.sendFile(path.join(distPath, "index.html"));
      });
    } else {
      console.log("Starting Vite dev server...");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    }

    httpServer.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

startServer().catch(err => {
  console.error("Unhandled error in startServer:", err);
  process.exit(1);
});














