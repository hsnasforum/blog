import { spawn } from "node:child_process";

const commands = [
  ["npm", ["run", "test:community:radar"]],
  ["npm", ["run", "test:dcinside:preview-qa"]],
  ["npm", ["run", "test:e2e:official-verification"]],
  ["npm", ["run", "test:e2e:community-article"]],
  ["npm", ["run", "test:e2e:github-issues-boost"]],
  ["npm", ["run", "test:e2e:auto-workflow"]],
  ["npm", ["run", "test:e2e:auto-workflow-progress"]],
  ["npm", ["run", "test:e2e:provider:oauth"]],
];

const SECRET_PATTERNS = [
  /authorization["']?\s*:\s*["']?bearer\s+[^"',\s}]+/gi,
  /bearer\s+[a-z0-9._-]+/gi,
  /OPENAI_API_KEY=[^,\s]+/gi,
  /GITHUB_TOKEN=[^,\s]+/gi,
  /REDDIT_BEARER_TOKEN=[^,\s]+/gi,
  /access_token["']?\s*[:=]\s*["']?[^"',\s}]+/gi,
  /refresh_token["']?\s*[:=]\s*["']?[^"',\s}]+/gi,
];

function nowIso() {
  return new Date().toISOString();
}

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

function sanitize(raw) {
  return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, "[redacted]"), String(raw));
}

function commandLabel(command, args) {
  return [command, ...args].join(" ");
}

async function runCommand(command, args) {
  const label = commandLabel(command, args);
  const startedAt = Date.now();
  console.log(`\n[e2e-serial] START ${nowIso()} :: ${label}`);

  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => process.stdout.write(sanitize(chunk.toString())));
    child.stderr.on("data", (chunk) => process.stderr.write(sanitize(chunk.toString())));
    child.on("error", reject);
    child.on("exit", (code) => {
      const duration = formatDuration(Date.now() - startedAt);
      if (code === 0) {
        console.log(`[e2e-serial] PASS ${nowIso()} :: ${label} (${duration})`);
        resolve();
        return;
      }
      reject(new Error(`[e2e-serial] FAIL ${nowIso()} :: ${label} (exit=${code}, duration=${duration})`));
    });
  });
}

const allStartedAt = Date.now();

try {
  console.log(`[e2e-serial] total start ${nowIso()}`);
  for (const [command, args] of commands) {
    await runCommand(command, args);
  }
  console.log(`[e2e-serial] total pass ${nowIso()} (${formatDuration(Date.now() - allStartedAt)})`);
} catch (error) {
  console.error(sanitize(error instanceof Error ? error.message : String(error)));
  console.error(`[e2e-serial] stopped after ${formatDuration(Date.now() - allStartedAt)}`);
  process.exitCode = 1;
}
