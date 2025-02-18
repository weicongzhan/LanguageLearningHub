
import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

// Ensure upload directories exist
function ensureDirectories() {
  const dirs = ['audio', 'images'];
  dirs.forEach(dir => {
    const dirPath = path.join(UPLOAD_DIR, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  });
}

ensureDirectories();

export async function uploadFile(localPath: string, fileName: string): Promise<string> {
  const targetDir = fileName.startsWith('audio/') ? 'audio' : 'images';
  const targetPath = path.join(UPLOAD_DIR, fileName);
  
  // Copy file to uploads directory
  await fs.promises.copyFile(localPath, targetPath);
  
  // Return relative URL path
  return `/uploads/${fileName}`;
}

export async function deleteFile(fileName: string): Promise<void> {
  const filePath = path.join(UPLOAD_DIR, fileName);
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
  }
}
