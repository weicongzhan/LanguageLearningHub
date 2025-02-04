import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { lessons, flashcards, userLessons, users } from "@db/schema";
import { eq, and, count } from "drizzle-orm";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import express from 'express';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    console.log('File destination:', uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const flashcardId = req.params.flashcardId;
    const ext = path.extname(file.originalname);
    let filename: string;

    if (file.fieldname === 'audio') {
      filename = `${flashcardId}-${file.fieldname}${ext}`;
    } else {
      // For images, add index to make each filename unique
      const timestamp = Date.now();
      const randomId = Math.floor(Math.random() * 1000000);
      filename = `${flashcardId}-${file.fieldname}-${timestamp}-${randomId}${ext}`;
    }

    console.log('Generated filename:', filename);
    cb(null, filename);
  }
});

// Filter to only allow certain file types
const fileFilter = (req: any, file: any, cb: any) => {
  if (file.fieldname === 'audio' && !file.mimetype.startsWith('audio/')) {
    return cb(new Error('Invalid audio file type'), false);
  }
  if (file.fieldname === 'images' && !file.mimetype.startsWith('image/')) {
    return cb(new Error('Invalid image file type'), false);
  }
  cb(null, true);
};

const upload = multer({ 
  storage,
  fileFilter
});

export function registerRoutes(app: Express): Server {
  // 确保uploads目录存在并配置静态文件服务
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
  }
  console.log('Serving static files from:', uploadsDir);
  app.use('/uploads', express.static(uploadsDir));

  setupAuth(app);

  // Middleware to check if user is admin
  const requireAdmin = (req: any, res: any, next: any) => {
    if (!req.user?.isAdmin) {
      return res.status(403).send("Admin access required");
    }
    next();
  };

  // Stats route for admin dashboard
  app.get("/api/stats", requireAdmin, async (req, res) => {
    try {
      const [lessonsCount] = await db.select({ count: count() }).from(lessons);
      const [flashcardsCount] = await db.select({ count: count() }).from(flashcards);
      const [studentsCount] = await db.select({ count: count() })
        .from(users)
        .where(eq(users.isAdmin, false));

      res.json({
        totalLessons: lessonsCount.count,
        totalFlashcards: flashcardsCount.count,
        totalStudents: studentsCount.count
      });
    } catch (error) {
      console.error('Stats error:', error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Create flashcard - Step 1: Initialize
  app.post("/api/flashcards/init", requireAdmin, async (req, res) => {
    const flashcardId = uuidv4();
    console.log('Initializing flashcard creation with ID:', flashcardId);
    res.json({ flashcardId });
  });

  // Create flashcard - Step 2: Upload files
  app.post("/api/flashcards/:flashcardId/upload", requireAdmin, async (req, res) => {
    const { flashcardId } = req.params;
    console.log('Processing file upload for flashcard:', flashcardId);

    const uploadMiddleware = upload.fields([
      { name: 'audio', maxCount: 1 },
      { name: 'images', maxCount: 4 }
    ]);

    try {
      await new Promise((resolve, reject) => {
        uploadMiddleware(req, res, (err) => {
          if (err) reject(err);
          else resolve(true);
        });
      });

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      console.log('Uploaded files:', files);

      const audioFile = files.audio?.[0];
      const imageFiles = files.images || [];

      if (!audioFile) {
        return res.status(400).json({ error: "Audio file is required" });
      }

      if (imageFiles.length < 2) {
        return res.status(400).json({ error: "At least 2 images are required" });
      }

      const audioUrl = `/uploads/${audioFile.filename}`;
      const imageUrls = imageFiles.map(file => `/uploads/${file.filename}`);
      const correctImageIndex = parseInt(req.body.correctImageIndex);

      if (isNaN(correctImageIndex) || correctImageIndex < 0 || correctImageIndex >= imageFiles.length) {
        return res.status(400).json({ error: "Invalid correct image index" });
      }

      console.log('Creating flashcard with paths:', { audioUrl, imageUrls });

      const [newFlashcard] = await db.insert(flashcards).values({
        lessonId: parseInt(req.body.lessonId),
        audioUrl,
        imageChoices: imageUrls,
        correctImageIndex
      }).returning();

      res.json(newFlashcard);
    } catch (error) {
      console.error('Upload error:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : "File upload failed",
        details: error
      });
    }
  });

  // Delete flashcard
  app.delete("/api/flashcards/:id", requireAdmin, async (req, res) => {
    try {
      const flashcardId = parseInt(req.params.id);

      const [flashcard] = await db
        .select()
        .from(flashcards)
        .where(eq(flashcards.id, flashcardId))
        .limit(1);

      if (!flashcard) {
        return res.status(404).json({ error: "Flashcard not found" });
      }

      // Delete the flashcard from database
      await db.delete(flashcards).where(eq(flashcards.id, flashcardId));

      // Delete associated files
      if (flashcard.audioUrl) {
        const audioPath = path.join(process.cwd(), flashcard.audioUrl);
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
      }

      const imageUrls = flashcard.imageChoices as string[];
      imageUrls.forEach(url => {
        const imagePath = path.join(process.cwd(), url);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      });

      res.json({ message: "Flashcard deleted successfully" });
    } catch (error) {
      console.error('Delete error:', error);
      res.status(500).json({ 
        error: "Failed to delete flashcard",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add this route before the lessons routes
  app.get("/api/students", requireAdmin, async (req, res) => {
    try {
      const students = await db
        .select()
        .from(users)
        .where(eq(users.isAdmin, false));

      res.json(students);
    } catch (error) {
      console.error('Failed to fetch students:', error);
      res.status(500).json({ error: "Failed to fetch students" });
    }
  });

  // Add bulk import endpoint
  app.post("/api/flashcards/bulk-import", requireAdmin, upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const results: any[] = [];
    let imported = 0;

    try {
      // Read and parse CSV file
      const fileContent = fs.readFileSync(req.file.path, 'utf-8');

      const parser = parse(fileContent, {
        columns: true,
        skip_empty_lines: true
      });

      for await (const record of parser) {
        try {
          // Validate required fields
          if (!record.lessonId || !record.audioUrl || !record.imageChoices || !record.correctImageIndex) {
            results.push({
              success: false,
              error: "Missing required fields",
              record
            });
            continue;
          }

          // Parse and validate data
          const lessonId = parseInt(record.lessonId);
          const imageChoices = JSON.parse(record.imageChoices);
          const correctImageIndex = parseInt(record.correctImageIndex);

          if (isNaN(lessonId) || !Array.isArray(imageChoices) || isNaN(correctImageIndex)) {
            results.push({
              success: false,
              error: "Invalid data format",
              record
            });
            continue;
          }

          // Check if lesson exists
          const [lesson] = await db
            .select()
            .from(lessons)
            .where(eq(lessons.id, lessonId))
            .limit(1);

          if (!lesson) {
            results.push({
              success: false,
              error: `Lesson with ID ${lessonId} not found`,
              record
            });
            continue;
          }

          // Create flashcard
          const [flashcard] = await db.insert(flashcards)
            .values({
              lessonId,
              audioUrl: record.audioUrl,
              imageChoices,
              correctImageIndex
            })
            .returning();

          results.push({
            success: true,
            flashcardId: flashcard.id
          });

          imported++;
        } catch (error) {
          results.push({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
            record
          });
        }
      }

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      res.json({
        imported,
        results
      });
    } catch (error) {
      console.error('Bulk import error:', error);
      res.status(500).json({ 
        error: "Failed to process CSV file",
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

  // User lesson routes
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

  app.post("/api/user-lessons", requireAdmin, async (req, res) => {
    try {
      const { userId, lessonId } = req.body;

      // Check if the assignment already exists
      const [existingAssignment] = await db
        .select()
        .from(userLessons)
        .where(and(
          eq(userLessons.userId, userId),
          eq(userLessons.lessonId, lessonId)
        ))
        .limit(1);

      if (existingAssignment) {
        return res.status(400).json({ error: "Lesson already assigned to this user" });
      }

      const [userLesson] = await db.insert(userLessons)
        .values({
          userId,
          lessonId,
          progress: {
            total: 0,
            completed: 0,
            reviews: []
          }
        })
        .returning();

      res.json(userLesson);
    } catch (error) {
      console.error('Failed to assign lesson:', error);
      res.status(500).json({ error: "Failed to assign lesson to user" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";

// Configure multer for file uploads
const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'files');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  }
});

const fileUpload = multer({ 
  storage: fileStorage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio', 'video', 'image'];
    const fileType = file.mimetype.split('/')[0];
    if (allowedTypes.includes(fileType)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// File management routes
app.post("/api/files/upload", requireAdmin, fileUpload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.body.title) {
      return res.status(400).json({ error: "File and title are required" });
    }

    const fileUrl = `/uploads/files/${req.file.filename}`;
    const fileType = req.file.mimetype.split('/')[0] as 'audio' | 'video' | 'image';

    const [newFile] = await db.insert(files).values({
      title: req.body.title,
      type: fileType,
      url: fileUrl,
      uploadedBy: req.user?.id,
      createdAt: new Date(),
    }).returning();

    res.json(newFile);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

app.get("/api/files", requireAdmin, async (req, res) => {
  try {
    const filesList = await db.select().from(files);
    res.json(filesList);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch files" });
  }
});
