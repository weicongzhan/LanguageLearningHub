
import fs from 'fs';
import path from 'path';

// 确保上传目录存在
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const TEMP_DIR = path.join(process.cwd(), 'tmp');

[UPLOAD_DIR, TEMP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

export async function uploadFile(localPath: string, fileName: string): Promise<string> {
  try {
    const targetDir = path.join(UPLOAD_DIR, path.dirname(fileName));
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetPath = path.join(UPLOAD_DIR, fileName);
    await fs.promises.copyFile(localPath, targetPath);

    // 删除临时文件
    if (fs.existsSync(localPath)) {
      await fs.promises.unlink(localPath);
    }

    return `/${fileName}`;
  } catch (error) {
    console.error('文件上传失败:', error);
    throw error;
  }
}

export async function deleteFile(fileName: string): Promise<void> {
  const filePath = path.join(UPLOAD_DIR, fileName.replace(/^\//, ''));
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
  }
}

export async function getLessonFiles(lessonId: string): Promise<{images: string[], audio: string[]}> {
  const lessonDir = path.join(UPLOAD_DIR, 'lessons', lessonId);
  const images: string[] = [];
  const audio: string[] = [];
  
  if (fs.existsSync(lessonDir)) {
    const files = await fs.promises.readdir(lessonDir);
    
    files.forEach(file => {
      const filePath = `/lessons/${lessonId}/${file}`;
      if (file.endsWith('.mp3') || file.endsWith('.wav')) {
        audio.push(filePath);
      } else if (file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.jpeg')) {
        images.push(filePath);
      }
    });
  }
  
  return { images, audio };
}
