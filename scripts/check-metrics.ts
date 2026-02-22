import { drizzle } from 'drizzle-orm/mysql2';
import { eq, desc } from 'drizzle-orm';
import { monthlyMetrics } from '../drizzle/schema';
import { config } from 'dotenv';
config();

if (!process.env.DATABASE_URL) {
  const { readFileSync } = await import('fs');
  const envContent = readFileSync('/home/ubuntu/.user_env', 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const db = drizzle(process.env.DATABASE_URL!);

console.log('\n=== Monthly Metrics for all AEs ===\n');

for (const [aeId, name] of [[30000, 'Henry Morris'], [30001, 'Joe Payne'], [30002, 'Toby Greer'], [30003, 'Julian Earl']]) {
  console.log(`\n--- ${name} ---`);
  const rows = await db.select().from(monthlyMetrics)
    .where(eq(monthlyMetrics.aeId, aeId as number))
    .orderBy(desc(monthlyMetrics.year), desc(monthlyMetrics.month))
    .limit(12);
  
  for (const r of rows) {
    console.log(`  ${r.year}-${String(r.month).padStart(2,'0')}: arr=$${r.arrUsd} demos=${r.demosTotal} dials=${r.dialsTotal}`);
  }
}

process.exit(0);
