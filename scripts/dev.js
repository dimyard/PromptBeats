import { spawn } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = path.join(rootDir, "backend");
const frontendDir = path.join(rootDir, "frontend");
const isWindows = process.platform === "win32";
const npmCommand = "npm";

function log(message) {
  console.log(`[dev] ${message}`);
}

function spawnCommand(command, args, cwd) {
  const options = {
    cwd,
    stdio: "inherit"
  };

  if (isWindows) {
    return spawn([command, ...args].join(" "), {
      ...options,
      shell: true
    });
  }

  return spawn(command, args, {
    ...options,
    shell: false
  });
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(command, args, cwd);

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

function startDevServer(name, cwd, onStop) {
  const child = spawnCommand(npmCommand, ["run", "dev"], cwd);

  child.on("error", (error) => {
    log(`${name} failed to start: ${error.message}`);
    onStop(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      log(`${name} stopped by ${signal}`);
      return;
    }

    log(`${name} exited with code ${code}`);
    onStop(code ?? 1);
  });

  return child;
}

async function main() {
  ensureBackendEnv();
  await ensureDependencies("backend", backendDir);
  await ensureDependencies("frontend", frontendDir);

  log("Starting backend (:3001) and frontend (:5173)...");
  let stopping = false;
  const children = [];

  const stop = (exitCode) => {
    if (stopping) {
      return;
    }

    stopping = true;
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGINT");
      }
    }

    if (typeof exitCode === "number") {
      setTimeout(() => process.exit(exitCode), 100);
    }
  };

  children.push(
    startDevServer("backend", backendDir, stop),
    startDevServer("frontend", frontendDir, stop)
  );

  process.on("SIGINT", () => {
    stop(130);
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    stop(143);
    process.exit(143);
  });
}

main().catch((error) => {
  console.error(`[dev] ${error.message}`);
  process.exit(1);
});
