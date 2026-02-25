import { db } from './server/_core/db.mjs';
import { deals } from './drizzle/schema.ts';
import { like } from 'drizzle-orm';

const result = await db.select().from(deals).where(like(deals.dealName, '%C-Axis%'));
console.log(result);
process.exit(0);
