import * as path from "path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { server } from "./server.js";
import { logger } from "./utils/logger.js";
import { closeAllDbs, resolveProjectRoot, getProjectSlug } from "./engine/db.js";
import { runAutoInit } from "./cli/init.js";
import { VERSION } from "./utils/version.js";

let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Received ${signal}. Shutting down world-model-mcp...`);

  const forceTimer = setTimeout(() => {
    logger.warn("Shutdown timed out. Forcing exit.");
    process.exit(signal === "uncaughtException" || signal === "unhandledRejection" ? 1 : 0);
  }, 1000);
  forceTimer.unref();

  try {
    await server.close();
    logger.info("MCP server connection closed.");
  } catch (err: any) {
    logger.error("Error closing MCP server:", err.message);
  }

  try {
    closeAllDbs();
    logger.info("Database connections closed.");
  } catch (err: any) {
    logger.error("Error closing databases:", err.message);
  }

  if (signal === "uncaughtException" || signal === "unhandledRejection") {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

async function main() {
  logger.info(`Starting world-model-mcp server v${VERSION}...`);

  // Run fast non-destructive auto-initialization
  try {
    const root = resolveProjectRoot();
    const projectName = path.basename(root);
    const projectSlug = getProjectSlug(projectName);
    await runAutoInit(root, projectSlug);
  } catch (err: any) {
    logger.warn(`Auto-initialization skipped: ${err.message}`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("world-model-mcp server connected over stdio.");
}

process.stdin.on("close", () => {
  shutdown("stdin close").catch((err) => {
    logger.error("Error during stdin close shutdown:", err);
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  shutdown("SIGINT").catch((err) => {
    logger.error("Error during SIGINT shutdown:", err);
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch((err) => {
    logger.error("Error during SIGTERM shutdown:", err);
    process.exit(1);
  });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  shutdown("uncaughtException").catch((err) => {
    logger.error("Error during shutdown:", err);
    process.exit(1);
  });
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  shutdown("unhandledRejection").catch((err) => {
    logger.error("Error during shutdown:", err);
    process.exit(1);
  });
});

main().catch((error) => {
  logger.error("Fatal error starting server:", error);
  process.exit(1);
});
