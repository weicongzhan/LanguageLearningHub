
import { db } from "../db";
import { users } from "../db/schema";
import fs from "fs";
import path from "path";

async function importUsers() {
  try {
    const usersData = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'attached_assets/users.json'), 'utf-8')
    );
    
    // Insert users one by one to handle conflicts
    for (const user of usersData) {
      try {
        await db.insert(users).values({
          id: user.id,
          username: user.username,
          password: user.password,
          isAdmin: user.is_admin,
          createdAt: new Date(user.created_at)
        });
        console.log(`Imported user: ${user.username}`);
      } catch (error) {
        console.error(`Failed to import user ${user.username}:`, error);
      }
    }
    
    console.log('Import completed');
  } catch (error) {
    console.error('Import failed:', error);
  } finally {
    process.exit();
  }
}

importUsers();
