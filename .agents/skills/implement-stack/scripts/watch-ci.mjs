#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { githubClient, observe, validateInput } from './ci-watch/github.mjs';
import { newState, resume, status, watch } from './ci-watch/watch.mjs';

const help = `Usage: node <skill-directory>/scripts/watch-ci.mjs --input <manifest.json> --state <state.json>
  --once             Observe once when polling is due; respect server retry delays
  --status           Immediately print cached status, observation age and staleness
  --ack <event-id>    Acknowledge pending events through this ID when resuming
  --heartbeat <sec>  Optional unchanged-status heartbeat (minimum 300; default off)
  --help             Show this help

JSON manifest: version:1, repo:"owner/repo", policyBranch:"main",
phase:"published"|"ready", optional stack:<number>, prs:[{number,head:<40-char SHA>,
checks:[{context,appId,workflow:".github/workflows/ci.yml",event:"pull_request",
optional readyAfter:<ISO timestamp>}]}]. See the implement-stack CI monitoring reference.
Read-only GitHub Actions observation; authentication: GH_TOKEN, GITHUB_TOKEN or gh auth.
Exit: 0 successful, 1 failed, 2 pending, 3 unknown, 4 inaccessible, 5 diverged,
64 invalid invocation/state, 130 interrupted. Failed checks remain watched for diagnostics/retries.
`;

async function requireGoneOwner(lock) {
  let owner;
  try {
    owner = JSON.parse(await readFile(`${lock}/owner.json`, 'utf8'));
    if (!Number.isSafeInteger(owner?.pid) || owner.pid <= 0 || owner.pid > 2_147_483_647)
      throw new Error('invalid PID');
  } catch (error) {
    throw new Error(`Lock ${lock} has an unverifiable owner in owner.json: ${error.message}`);
  }
  try {
    process.kill(owner.pid, 0);
  } catch (error) {
    if (error.code === 'ESRCH') return owner.pid;
    throw new Error(`Lock ${lock} owner PID ${owner.pid} is unverifiable: ${error.message}`);
  }
  throw new Error(`Lock ${lock} is held by live owner PID ${owner.pid}`);
}

async function acquireLock(lock) {
  try {
    await mkdir(lock);
    return;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const pid = await requireGoneOwner(lock);
  // Serialize recovery so competing resumptions cannot remove a replacement lock.
  const recovery = `${lock}.reclaim`;
  try {
    await mkdir(recovery);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(`Lock ${lock} owner PID ${pid} has an unresolved recovery at ${recovery}`);
  }
  try {
    await requireGoneOwner(lock);
    await rm(lock, { recursive: true });
    await mkdir(lock);
  } finally {
    await rmdir(recovery);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: 'string' },
      state: { type: 'string' },
      once: { type: 'boolean' },
      status: { type: 'boolean' },
      ack: { type: 'string' },
      heartbeat: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    process.stdout.write(help);
    return 0;
  }
  if (!values.input || !values.state || (values.status && (values.ack || values.once)))
    throw new Error('Provide --input and --state; --status is read-only');
  const heartbeatMs = values.heartbeat === undefined ? 0 : Number(values.heartbeat) * 1000;
  if (
    !Number.isFinite(heartbeatMs) ||
    heartbeatMs < 0 ||
    (heartbeatMs > 0 && heartbeatMs < 300_000)
  )
    throw new Error('Heartbeat must be zero or at least 300 seconds');
  const input = validateInput(JSON.parse(await readFile(values.input, 'utf8')));
  const path = resolve(values.state);
  if (path === resolve(values.input)) throw new Error('State must not overwrite input');
  async function load() {
    try {
      return resume(input, JSON.parse(await readFile(path, 'utf8')));
    } catch (error) {
      if (error.code === 'ENOENT') return newState(input);
      throw error;
    }
  }
  if (values.status) {
    process.stdout.write(`${JSON.stringify(status(await load()))}\n`);
    return 0;
  }
  await mkdir(dirname(path), { recursive: true });
  const lock = `${path}.lock`;
  await acquireLock(lock);
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  process.on('SIGHUP', interrupt);
  try {
    await writeFile(
      `${lock}/owner.json`,
      JSON.stringify({ pid: process.pid, input: resolve(values.input) }),
    );
    const state = resume(input, await load(), values.ack);
    const save = async (next) => {
      const temporary = `${path}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(next)}\n`, { mode: 0o600 });
      await rename(temporary, path);
    };
    await save(state);
    const token =
      process.env.GH_TOKEN ||
      process.env.GITHUB_TOKEN ||
      execFileSync('gh', ['auth', 'token', '--hostname', 'github.com'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    const api = githubClient({ token, signal: controller.signal });
    const result = await watch({
      input,
      state,
      observe: () => observe(input, api),
      save,
      emit: (event) => {
        process.stdout.write(`${JSON.stringify(event)}\n`);
      },
      sleep: (ms, signal) => delay(ms, undefined, { signal }),
      signal: controller.signal,
      once: values.once,
      heartbeatMs,
    });
    if (controller.signal.aborted) return 130;
    return (
      { successful: 0, failed: 1, pending: 2, unknown: 3, inaccessible: 4, diverged: 5 }[
        result.snapshot?.state
      ] ?? 3
    );
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    process.off('SIGHUP', interrupt);
    await rm(lock, { recursive: true });
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`ci:watch: ${error.message}\n`);
    process.exitCode = 64;
  });
