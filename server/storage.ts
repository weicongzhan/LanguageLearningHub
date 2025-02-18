
import { Client } from '@replit/object-storage';
import fs from 'fs';
import path from 'path';

const client = new Client();

// 确保临时上传目录存在
const TEMP_DIR = path.join(process.cwd(), 'tmp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

export async function uploadFile(localPath: string, fileName: string): Promise<string> {
  const fileContent = await fs.promises.readFile(localPath);
  const objectKey = fileName.startsWith('/') ? fileName.slice(1) : fileName;
  
  // 上传到对象存储
  await client.put(objectKey, fileContent);
  
  // 删除临时文件
  await fs.promises.unlink(localPath);
  
  // 返回对象URL
  return `/${objectKey}`;
}

export async function deleteFile(fileName: string): Promise<void> {
  const objectKey = fileName.startsWith('/') ? fileName.slice(1) : fileName;
  await client.delete(objectKey);
}

// 获取课程相关的所有文件
export async function getLessonFiles(lessonId: string): Promise<{images: string[], audio: string[]}> {
  const prefix = `lessons/${lessonId}/`;
  const objects = await client.list({ prefix });
  
  const images: string[] = [];
  const audio: string[] = [];
  
  for (const obj of objects) {
    const path = '/' + obj.key;
    if (path.endsWith('.mp3') || path.endsWith('.wav')) {
      audio.push(path);
    } else if (path.endsWith('.jpg') || path.endsWith('.png') || path.endsWith('.jpeg')) {
      images.push(path);
    }
  }
  
  return { images, audio };
}
