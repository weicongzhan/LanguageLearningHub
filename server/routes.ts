import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { lessons, flashcards, userLessons } from "@db/schema";
import { eq, and } from "drizzle-orm";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import express from 'express'; //Import express here

// 确保上传目录存在
const uploadDirs = ['./uploads/audio', './uploads/images'];
uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure multer for both audio and image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = file.mimetype.startsWith('audio/') ? './uploads/audio' : './uploads/images';
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio and image files are allowed.'));
    }
  }
});

// Middleware to handle multiple file uploads
const uploadFiles = upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'images', maxCount: 4 }
]);

export function registerRoutes(app: Express): Server {
  // Serve uploaded files
  app.use('/uploads', express.static('uploads'));

  setupAuth(app);

  // Middleware to check if user is admin
  const requireAdmin = (req: any, res: any, next: any) => {
    if (!req.user?.isAdmin) {
      return res.status(403).send("Admin access required");
    }
    next();
  };

  // Flashcard routes with improved error handling
  app.post("/api/flashcards", requireAdmin, async (req, res) => {
    try {
      uploadFiles(req, res, async (err) => {
        if (err) {
          console.error('File upload error:', err);
          return res.status(400).json({ 
            error: err.message || "File upload failed",
            details: err
          });
        }

        try {
          const files = req.files as { [fieldname: string]: Express.Multer.File[] };
          const audioFile = files.audio?.[0];
          const imageFiles = files.images || [];

          console.log('Received files:', {
            audio: audioFile?.filename,
            images: imageFiles.map(f => f.filename)
          });

          if (!audioFile) {
            return res.status(400).json({ error: "Audio file is required" });
          }

          if (imageFiles.length < 2) {
            return res.status(400).json({ error: "At least 2 images are required" });
          }

          const audioUrl = `/uploads/audio/${audioFile.filename}`;
          const imageUrls = imageFiles.map(file => `/uploads/images/${file.filename}`);
          const correctImageIndex = parseInt(req.body.correctImageIndex);

          if (isNaN(correctImageIndex) || correctImageIndex < 0 || correctImageIndex >= imageFiles.length) {
            return res.status(400).json({ error: "Invalid correct image index" });
          }

          const [newFlashcard] = await db.insert(flashcards).values({
            lessonId: parseInt(req.body.lessonId),
            audioUrl,
            imageChoices: imageUrls,
            correctImageIndex
          }).returning();

          console.log('Created flashcard:', newFlashcard);
          res.json(newFlashcard);
        } catch (error) {
          console.error('Database error:', error);
          res.status(500).json({ 
            error: "Failed to create flashcard",
            details: error instanceof Error ? error.message : String(error)
          });
        }
      });
    } catch (error) {
      console.error('Outer error:', error);
      res.status(500).json({ 
        error: "Failed to process request",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

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

  // User lesson access routes
  app.post("/api/user-lessons", requireAdmin, async (req, res) => {
    try {
      const [userLesson] = await db.insert(userLessons).values(req.body).returning();
      res.json(userLesson);
    } catch (error) {
      res.status(500).json({ error: "Failed to assign lesson to user" });
    }
  });

  // Get user lessons with flashcards
  app.get("/api/user-lessons/:userId/:lessonId?", async (req, res) => {
    try {
      const { userId, lessonId } = req.params;
      let query = db.query.userLessons.findMany({
        where: eq(userLessons.userId, parseInt(userId)),
        with: {
          lesson: {
            with: {
              flashcards: true
            }
          }
        }
      });

      // If lessonId is provided, filter for specific lesson
      if (lessonId) {
        query = db.query.userLessons.findMany({
          where: and(
            eq(userLessons.userId, parseInt(userId)),
            eq(userLessons.lessonId, parseInt(lessonId))
          ),
          with: {
            lesson: {
              with: {
                flashcards: true
              }
            }
          }
        });
      }

      const userLessonsList = await query;
      res.json(lessonId ? userLessonsList[0] : userLessonsList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user lessons" });
    }
  });

  // Update progress
  app.put("/api/user-lessons/:id/progress", async (req, res) => {
    try {
      const [updated] = await db
        .update(userLessons)
        .set({ 
          progress: req.body.progress,
          totalStudyTime: req.body.totalStudyTime,
          lastStudyDate: new Date()
        })
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