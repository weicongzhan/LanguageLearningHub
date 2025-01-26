import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { lessons, flashcards, userLessons } from "@db/schema";
import { eq, and } from "drizzle-orm";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import path from "path";

// Configure multer for audio file uploads
const storage = multer.diskStorage({
  destination: "./uploads/audio",
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  }
});

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Middleware to check if user is admin
  const requireAdmin = (req: any, res: any, next: any) => {
    if (!req.user?.isAdmin) {
      return res.status(403).send("Admin access required");
    }
    next();
  };

  // Lesson routes
  app.get("/api/lessons", async (req, res) => {
    try {
      const allLessons = await db.query.lessons.findMany({
        with: {
          flashcards: true
        }
      });
      res.json(allLessons);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch lessons" });
    }
  });

  app.post("/api/lessons", requireAdmin, async (req, res) => {
    try {
      const [newLesson] = await db.insert(lessons).values(req.body).returning();
      res.json(newLesson);
    } catch (error) {
      res.status(500).json({ error: "Failed to create lesson" });
    }
  });

  // Flashcard routes
  app.post("/api/flashcards", requireAdmin, upload.single("audio"), async (req, res) => {
    try {
      const audioUrl = req.file ? `/uploads/audio/${req.file.filename}` : undefined;
      const [newFlashcard] = await db.insert(flashcards).values({
        ...req.body,
        audioUrl
      }).returning();
      res.json(newFlashcard);
    } catch (error) {
      res.status(500).json({ error: "Failed to create flashcard" });
    }
  });

  // User lesson access routes
  app.post("/api/user-lessons", requireAdmin, async (req, res) => {
    try {
      const [userLesson] = await db.insert(userLessons).values(req.body).returning();
      res.json(userLesson);
    } catch (error) {
      res.status(500).json({ error: "Failed to assign lesson to user" });
    }
  });

  app.get("/api/user-lessons/:userId", async (req, res) => {
    try {
      const userLessonsList = await db.query.userLessons.findMany({
        where: eq(userLessons.userId, parseInt(req.params.userId)),
        with: {
          lesson: {
            with: {
              flashcards: true
            }
          }
        }
      });
      res.json(userLessonsList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user lessons" });
    }
  });

  // Update progress
  app.put("/api/user-lessons/:id/progress", async (req, res) => {
    try {
      const [updated] = await db
        .update(userLessons)
        .set({ progress: req.body.progress })
        .where(eq(userLessons.id, parseInt(req.params.id)))
        .returning();
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update progress" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
