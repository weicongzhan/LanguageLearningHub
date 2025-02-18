import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { lessons, flashcards, userLessons, users, files } from "@db/schema";
import { eq, and, count, sql } from "drizzle-orm";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import express from 'express';
import { uploadFile, deleteFile } from './storage';
import sharp from 'sharp'; // Import sharp library

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = '/tmp/uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
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
  // 确保uploads目录和子目录存在
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const filesDir = path.join(uploadsDir, 'files');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
  }
  if (!fs.existsSync(filesDir)) {
    fs.mkdirSync(filesDir);
  }

  // 配置静态文件服务
  app.use('/uploads', express.static(uploadsDir, {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }));
  app.use('/uploads/files', express.static(path.join(uploadsDir, 'files')));
  app.use('/uploads/images', express.static(path.join(uploadsDir, 'images')));
  app.use('/uploads/audio', express.static(path.join(uploadsDir, 'audio')));

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

  // Image processing middleware
  const processImage = async (file: Express.Multer.File) => {
    const image = sharp(file.path);
    const metadata = await image.metadata();

    if (metadata.width && metadata.width > 500 || metadata.height && metadata.height > 500) {
      await image
        .resize(500, 500, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .toFile(file.path + '_resized');

      fs.unlinkSync(file.path);
      fs.renameSync(file.path + '_resized', file.path);
    }
  };


  // Create flashcard - Step 2: Upload files
  app.post("/api/flashcards/:flashcardId/upload", requireAdmin, upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'images', maxCount: 4 }
  ]), async (req, res) => {
    const { flashcardId } = req.params;
    console.log('Processing file upload for flashcard:', flashcardId);

    try {
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

      //Process images before proceeding
      await Promise.all(imageFiles.map(file => processImage(file)));

      const audioUrl = await uploadFile(audioFile.path, `audio/${uuidv4()}${path.extname(audioFile.originalname)}`);
      const imageUrls = await Promise.all(imageFiles.map(file => 
        uploadFile(file.path, `images/${uuidv4()}${path.extname(file.originalname)}`)
      ));
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

  // Add endpoint to update user admin status
  app.put("/api/users/:id/admin", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { isAdmin } = req.body;

      const [updatedUser] = await db
        .update(users)
        .set({ isAdmin })
        .where(eq(users.id, userId))
        .returning();

      res.json(updatedUser);
    } catch (error) {
      console.error('Failed to update admin status:', error);
      res.status(500).json({ error: "Failed to update admin status" });
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

      const parser = csvParser();
      parser.on('data', async (record) => {
          try {
            // Validate required fields
            if (!record.lessonId || !record.audioUrl || !record.imageChoices || !record.correctImageIndex) {
              results.push({
                success: false,
                error: "Missing required fields",
                record
              });
              return;
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
              return;
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
              return;
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
      });

      parser.on('end', () => {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        res.json({
          imported,
          results
        });
      });

      fileContent.pipe(parser);


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

  // Add delete lesson endpoint after existing lesson routes
  app.delete("/api/lessons/:id", requireAdmin, async (req, res) => {
    try {
      const lessonId = parseInt(req.params.id);

      // First delete all related flashcards
      const flashcardsToDelete = await db
        .select()
        .from(flashcards)
        .where(eq(flashcards.lessonId, lessonId));

      // Delete flashcard files
      for (const flashcard of flashcardsToDelete) {
        // Delete audio file
        if (flashcard.audioUrl) {
          const audioPath = path.join(process.cwd(), flashcard.audioUrl);
          if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
          }
        }

        // Delete image files
        const imageUrls = flashcard.imageChoices as string[];
        imageUrls.forEach(url => {
          const imagePath = path.join(process.cwd(), url);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        });
      }

      // Delete all user_lessons associated with this lesson
      await db.delete(userLessons)
        .where(eq(userLessons.lessonId, lessonId));

      // Delete all flashcards associated with this lesson
      await db.delete(flashcards)
        .where(eq(flashcards.lessonId, lessonId));

      // Finally delete the lesson
      const [deletedLesson] = await db.delete(lessons)
        .where(eq(lessons.id, lessonId))
        .returning();

      if (!deletedLesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      res.json({ message: "Lesson and all associated data deleted successfully" });
    } catch (error) {
      console.error('Delete lesson error:', error);
      res.status(500).json({ 
        error: "Failed to delete lesson",
        details: error instanceof Error ? error.message : String(error)
      });
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
      const uploadedBy = req.user?.id;

      if (!uploadedBy) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const [newFile] = await db.insert(files).values({
        title: req.body.title,
        type: fileType,
        url: fileUrl,
        uploadedBy,
        assignedStudents: [],
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
      // 生成新的 ETag
      const timestamp = Date.now();
      const etag = `W/"files-${timestamp}"`;
      
      // 设置强制刷新的头部
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '-1',
        'ETag': etag
      });

      // 检查客户端的 If-None-Match 头部
      const clientEtag = req.headers['if-none-match'];
      
      // 总是获取最新数据
      const filesList = await db.select().from(files);
      
      // 强制返回新数据，不返回 304
      res.status(200).json(filesList);
    } catch (error) {
      console.error('Files fetch error:', error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  app.get("/api/student/files", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const filesList = await db.select().from(files)
        .where(sql`${files.assignedStudents}::jsonb @> ${[req.user.id]}::jsonb`);
      res.json(filesList);
    } catch (error) {
      console.error('Student files fetch error:', error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  app.post("/api/files/:id/assign", requireAdmin, async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      const { studentId } = req.body;

      const [file] = await db
        .select()
        .from(files)
        .where(eq(files.id, fileId))
        .limit(1);

      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      const assignedStudents = [...new Set([...file.assignedStudents, studentId])];

      const [updatedFile] = await db
        .update(files)
        .set({ assignedStudents })
        .where(eq(files.id, fileId))
        .returning();

      res.json(updatedFile);
    } catch (error) {
      console.error('Assignment error:', error);
      res.status(500).json({ error: "Failed to assign file" });
    }
  });

  // Delete file
  app.delete("/api/files/:id", async (req, res) => {
    try {
      if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          error: "需要管理员权限"
        });
      }

      const fileId = parseInt(req.params.id);
      if (isNaN(fileId)) {
        return res.status(400).json({
          success: false,
          error: "无效的文件ID"
        });
      }

      console.log('开始删除文件，ID:', fileId);

      // 首先查询文件是否存在
      const [existingFile] = await db
        .select()
        .from(files)
        .where(eq(files.id, fileId))
        .limit(1);

      if (!existingFile) {
        console.log('文件不存在，ID:', fileId);
        return res.status(404).json({
          success: false,
          error: "文件不存在"
        });
      }

      console.log('找到文件记录:', JSON.stringify(existingFile, null, 2));

      // 尝试删除物理文件
      if (existingFile.url) {
        try {
          const fileName = existingFile.url.split('/').pop();
          if (fileName) {
            const possiblePaths = [
              path.join(process.cwd(), existingFile.url),
              path.join(process.cwd(), 'uploads', 'files', fileName),
              path.join(process.cwd(), 'uploads', fileName)
            ];

            console.log('尝试删除物理文件，检查路径:', possiblePaths);
            
            let fileDeleted = false;
            for (const filePath of possiblePaths) {
              if (fs.existsSync(filePath)) {
                console.log('找到物理文件:', filePath);
                try {
                  fs.unlinkSync(filePath);
                  console.log('物理文件删除成功:', filePath);
                  fileDeleted = true;
                  break;
                } catch (unlinkError) {
                  console.error('删除物理文件失败:', filePath, unlinkError);
                }
              } else {
                console.log('路径不存在:', filePath);
              }
            }

            if (!fileDeleted) {
              console.warn('未找到物理文件或删除失败');
            }
          }
        } catch (fsError) {
          console.error('处理物理文件时出错:', fsError);
        }
      }

      // 删除数据库记录
      console.log('开始删除数据库记录...');
      const deleteResult = await db
        .delete(files)
        .where(eq(files.id, fileId))
        .returning();

      console.log('删除操作结果:', deleteResult);

      if (!deleteResult || deleteResult.length === 0) {
        console.error('数据库记录删除失败');
        return res.status(500).json({
          success: false,
          error: "数据库记录删除失败"
        });
      }

      // 验证删除
      const [checkFile] = await db
        .select()
        .from(files)
        .where(eq(files.id, fileId))
        .limit(1);

      if (checkFile) {
        console.error('文件仍然存在于数据库中:', checkFile);
        return res.status(500).json({
          success: false,
          error: "文件删除验证失败"
        });
      }

      // 设置响应头以防止缓存
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });

      console.log('文件删除成功完成');
      return res.status(200).json({
        success: true,
        message: "文件删除成功",
        deletedFile: deleteResult[0]
      });

    } catch (error) {
      console.error('删除文件时发生错误:', error);
      return res.status(500).json({
        success: false,
        error: "删除文件失败",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Change the import at the bottom of the file
import csvParser from 'csv-parser';