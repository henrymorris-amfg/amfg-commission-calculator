import { getDb } from '../db';
import { aeProfiles } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) throw new Error('No database');

  // Mark Henry Morris (ID 1) as team leader
  const result = await db
    .update(aeProfiles)
    .set({ isTeamLeader: true })
    .where(eq(aeProfiles.id, 1));

  console.log('Updated Henry Morris to team leader');
  console.log('Result:', result);
}

main().catch(console.error).finally(() => process.exit(0));
