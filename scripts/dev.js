import { spawn } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = path.join(rootDir, "backend");
const frontendDir = path.join(rootDir, "frontend");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function log(message) {
  console.log(`[dev] ${message}`);
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: false
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function ensureDependencies(name, cwd) {
  if (existsSync(path.join(cwd, "node_modules"))) {
    return;
  }

  log(`Installing ${name} dependencies...`);
  await run(npmCommand, ["install"], cwd);
}

function ensureBackendEnv() {
  const envPath = path.join(backendDir, ".env");
  const examplePath = path.join(backendDir, ".env.example");

  if (existsSync(envPath) || !existsSync(examplePath)) {
    return;
  }

  copyFileSync(examplePath, envPath);
  log("Created backend/.env from backend/.env.example");
}

function startDevServer(name, cwd) {
  const child = spawn(npmCommand, ["run", "dev"], {
    cwd,
    stdio: "inherit",
    shell: false
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      log(`${name} stopped by ${signal}`);
      return;
    }

    log(`${name} exited with code ${code}`);
  });

  return child;
}

async function main() {
  ensureBackendEnv();
  await ensureDependencies("backend", backendDir);
  await ensureDependencies("frontend", frontendDir);

  log("Starting backend (:3001) and frontend (:5173)...");
  const children = [
    startDevServer("backend", backendDir),
    startDevServer("frontend", frontendDir)
  ];

  const stop = () => {
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGINT");
      }
    }
  };

  process.on("SIGINT", () => {
    stop();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    stop();
    process.exit(143);
  });
}

main().catch((error) => {
  console.error(`[dev] ${error.message}`);
  process.exit(1);
});
