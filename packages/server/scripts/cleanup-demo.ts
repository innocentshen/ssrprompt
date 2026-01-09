/**
 * Demo Data Cleanup Script
 * Removes demo user data older than 7 days
 * Run this as a cron job: 0 3 * * * (daily at 3 AM)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_EXPIRY_DAYS = 7;

async function cleanupDemoData() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DEMO_EXPIRY_DAYS);

  console.log(`Cleaning up demo data older than ${cutoffDate.toISOString()}`);

  // Delete demo traces
  const deletedTraces = await prisma.trace.deleteMany({
    where: {
      userId: { startsWith: 'demo_' },
      createdAt: { lt: cutoffDate },
    },
  });
  console.log(`Deleted ${deletedTraces.count} demo traces`);

  // Delete demo evaluations (cascade deletes test cases, criteria, runs, results)
  const deletedEvaluations = await prisma.evaluation.deleteMany({
    where: {
      userId: { startsWith: 'demo_' },
      createdAt: { lt: cutoffDate },
    },
  });
  console.log(`Deleted ${deletedEvaluations.count} demo evaluations`);

  // Delete demo prompts (cascade deletes versions)
  const deletedPrompts = await prisma.prompt.deleteMany({
    where: {
      userId: { startsWith: 'demo_' },
      createdAt: { lt: cutoffDate },
    },
  });
  console.log(`Deleted ${deletedPrompts.count} demo prompts`);

  // Delete demo providers (cascade deletes models)
  const deletedProviders = await prisma.provider.deleteMany({
    where: {
      userId: { startsWith: 'demo_' },
      createdAt: { lt: cutoffDate },
      isSystem: false, // Don't delete system providers
    },
  });
  console.log(`Deleted ${deletedProviders.count} demo providers`);

  // Clean up expired sessions
  const deletedSessions = await prisma.session.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
  console.log(`Deleted ${deletedSessions.count} expired sessions`);

  // Delete demo users (created via /auth/demo-token) older than expiry window
  // This will also cascade-delete any remaining demo data via foreign keys.
  const deletedDemoUsers = await prisma.user.deleteMany({
    where: {
      id: { startsWith: 'demo_' },
      createdAt: { lt: cutoffDate },
    },
  });
  console.log(`Deleted ${deletedDemoUsers.count} demo users`);

  console.log('Demo data cleanup completed!');
}

cleanupDemoData()
  .catch((e) => {
    console.error('Cleanup failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
