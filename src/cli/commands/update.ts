import { execSync } from "child_process";

export async function runUpdate(currentVersion: string): Promise<void> {
  console.log(`Checking for updates to @putervision/world-model-mcp (current: v${currentVersion})...`);
  try {
    execSync("npm install -g @putervision/world-model-mcp@latest", { stdio: "inherit" });
    console.log("Update check complete.");
  } catch (err: any) {
    console.error(`Update failed: ${err.message}`);
  }
}
