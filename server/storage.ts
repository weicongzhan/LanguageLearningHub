
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
  try {
    const fileContent = await fs.promises.readFile(localPath);
    const objectKey = fileName.startsWith('/') ? fileName.slice(1) : fileName;
    
    console.log('正在上传文件:', {
      localPath,
      objectKey
    });

    // 上传到对象存储
    await client.put(objectKey, fileContent);
    
    // 验证文件是否成功上传
    const exists = await client.head(objectKey);
    if (!exists) {
      throw new Error(`File upload failed: ${objectKey}`);
    }

    console.log('文件上传成功:', objectKey);
    
    // 删除临时文件
    if (fs.existsSync(localPath)) {
      await fs.promises.unlink(localPath);
      console.log('临时文件已删除:', localPath);
    }
    
    // 返回对象URL
    return `/${objectKey}`;
  } catch (error) {
    console.error('文件上传失败:', error);
    throw error;
  }
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
