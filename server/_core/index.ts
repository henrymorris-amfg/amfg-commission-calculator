import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startWeeklySyncScheduler, runWeeklySync, getLastSyncResult, getNextSyncTime } from "../weeklySync";
import { initializeTierReportScheduler } from "../tierReportScheduler";
import { initializeDemoDetectionScheduler } from "../demoDetectionScheduler";
import { initializeTierChangeScheduler } from "../tierChangeScheduler";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // ─── Scheduled Task endpoint ─────────────────────────────────────────────────
  // Called by the Manus scheduled task agent daily at 09:00 GMT.
  // The platform auto-injects a session cookie with role="user" for scheduled tasks.
  // We authenticate via that cookie and run the full sync.
  app.post("/api/scheduled/voip-sync", async (req, res) => {
    try {
      // Allow requests with a valid Manus session cookie (user or admin role)
      let authorized = false;
      try {
        const user = await (await import("./sdk")).sdk.authenticateRequest(req);
        authorized = !!user;
      } catch {
        authorized = false;
      }
      if (!authorized) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      console.log("[ScheduledSync] /api/scheduled/voip-sync triggered");
      const result = await runWeeklySync();
      res.json({
        success: result.voipSync.success && result.spreadsheetSync.success && result.pipedriveSync.success,
        timestamp: result.timestamp,
        voip: result.voipSync,
        spreadsheet: result.spreadsheetSync,
        pipedrive: result.pipedriveSync,
      });
    } catch (err) {
      console.error("[ScheduledSync] Error:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Health check endpoint for scheduled task
  app.get("/api/scheduled/sync-status", async (req, res) => {
    const last = getLastSyncResult();
    const next = getNextSyncTime();
    res.json({
      lastRun: last ? { timestamp: last.timestamp, voip: last.voipSync, spreadsheet: last.spreadsheetSync, pipedrive: last.pipedriveSync } : null,
      nextScheduledAt: next?.toISOString() ?? null,
    });
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // ─── Scheduled Jobs ─────────────────────────────────────────────────────────
  // Daily 08:00 UTC: Pipedrive ARR sync + VOIP dials sync + Spreadsheet demos sync
  startWeeklySyncScheduler();

  // Monthly 10th at 09:00 GMT: Tier report email to team leader
  initializeTierReportScheduler();

  // Daily 08:00 GMT: Demo duplicate detection + CRM hygiene checks
  initializeDemoDetectionScheduler();

  // Daily 08:05 GMT: Tier change notifications (runs after sync to use fresh data)
  initializeTierChangeScheduler();
}

startServer().catch(console.error);
