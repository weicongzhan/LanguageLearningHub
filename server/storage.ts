
import { Client } from '@replit/object-storage';
import fs from 'fs';

const storage = new Client();

export async function uploadFile(localPath: string, fileName: string): Promise<string> {
  const fileContent = await fs.promises.readFile(localPath);
  await storage.upload(fileName, fileContent);
  const url = await storage.getSignedUrl(fileName);
  return url;
}

export async function deleteFile(fileName: string): Promise<void> {
  await storage.delete(fileName);
}
