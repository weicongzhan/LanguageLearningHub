import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

// Lessons table
export const lessons = pgTable("lessons", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  language: text("language").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// Flashcards table with multiple choice support
export const flashcards = pgTable("flashcards", {
  id: serial("id").primaryKey(),
  lessonId: integer("lesson_id").references(() => lessons.id, { onDelete: "cascade" }).notNull(),
  front: text("front"), // Make front optional
  back: text("back"), // Make back optional
  audioUrl: text("audio_url").notNull(),
  imageChoices: jsonb("image_choices").default([]).notNull(), // Array of image URLs
  correctImageIndex: integer("correct_image_index").notNull(), // Index of the correct image in choices
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// Enhanced user lesson progress tracking
export const userLessons = pgTable("user_lessons", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  lessonId: integer("lesson_id").references(() => lessons.id, { onDelete: "cascade" }).notNull(),
  totalStudyTime: integer("total_study_time").default(0).notNull(), // in seconds
  lastStudyDate: timestamp("last_study_date"),
  progress: jsonb("progress").default({
    total: 0,
    completed: 0,
    reviews: [] // Array of review records with timestamp and success rate
  }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// Relations
export const lessonRelations = relations(lessons, ({ many }) => ({
  flashcards: many(flashcards),
  userLessons: many(userLessons)
}));

export const userRelations = relations(users, ({ many }) => ({
  userLessons: many(userLessons)
}));

export const userLessonsRelations = relations(userLessons, ({ one }) => ({
  user: one(users, {
    fields: [userLessons.userId],
    references: [users.id]
  }),
  lesson: one(lessons, {
    fields: [userLessons.lessonId],
    references: [lessons.id]
  })
}));

export const flashcardRelations = relations(flashcards, ({ one }) => ({
  lesson: one(lessons, {
    fields: [flashcards.lessonId],
    references: [lessons.id]
  })
}));

// Schemas
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertLessonSchema = createInsertSchema(lessons);
export const selectLessonSchema = createSelectSchema(lessons);
export const insertFlashcardSchema = createInsertSchema(flashcards);
export const selectFlashcardSchema = createSelectSchema(flashcards);
export const insertUserLessonSchema = createInsertSchema(userLessons);
export const selectUserLessonSchema = createSelectSchema(userLessons);

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Lesson = typeof lessons.$inferSelect;
export type InsertLesson = typeof lessons.$inferInsert;
export type Flashcard = typeof flashcards.$inferSelect;
export type InsertFlashcard = typeof flashcards.$inferInsert;
export type UserLesson = typeof userLessons.$inferSelect;
export type InsertUserLesson = typeof userLessons.$inferInsert;

export type Review = {
  timestamp: string;
  flashcardId: number;
  successful: boolean;
};

export type Progress = {
  total: number;
  completed: number;
  reviews: Review[];
};

export type UserLessonWithRelations = UserLesson & {
  lesson: Lesson & {
    flashcards: Flashcard[]
  }
};
// Files table
export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull(),
  url: text("url").notNull(),
  uploadedBy: integer("uploaded_by").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export type File = typeof files.$inferSelect;
export type InsertFile = typeof files.$inferInsert;
