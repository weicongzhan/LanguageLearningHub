
import { Client } from '@replit/object-storage';
import fs from 'fs';

const storage = new Client();

export async function uploadFile(localPath: string, fileName: string): Promise<string> {
  const fileContent = await fs.promises.readFile(localPath);
  const result = await storage.put(fileName, fileContent);
  if (!result.ok) {
    throw new Error(result.error);
  }
  const urlResult = await storage.getSignedUrl(fileName);
  if (!urlResult.ok) {
    throw new Error(urlResult.error);
  }
  return urlResult.value;
}

export async function deleteFile(fileName: string): Promise<void> {
  const result = await storage.delete(fileName);
  if (!result.ok) {
    throw new Error(result.error);
  }
}
