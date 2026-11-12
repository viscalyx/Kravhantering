import { createHash } from 'node:crypto';
import { validateInput } from './github.mjs';

const INITIAL_INTERVAL = 15_000;
const MAX_INTERVAL = 300_000;

function fingerprint(snapshot) {
  // Observation timestamps and historical results are evidence, not new notifications.
  return JSON.stringify(snapshot, (key, value) =>
    ['observedAt', 'retryAt', 'history'].includes(key) ? undefined : value,
  );
}

export function newState(input) {
  validateInput(input);
  return {
    version: 1,
    watchId: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
    sequence: 0,
    interval: INITIAL_INTERVAL,
    nextPollAt: 0,
    lastHeartbeat: 0,
    pending: [],
  };
}

export function resume(input, state, acknowledgement) {
  if (
    state.version !== 1 ||
    state.watchId !== newState(input).watchId ||
    !Array.isArray(state.pending) ||
    !Number.isSafeInteger(state.sequence) ||
    state.sequence < 0 ||
    !Number.isFinite(state.nextPollAt) ||
    state.nextPollAt < 0 ||
    !Number.isFinite(state.lastHeartbeat) ||
    state.lastHeartbeat < 0 ||
    !Number.isFinite(state.interval) ||
    state.interval < INITIAL_INTERVAL ||
    state.interval > MAX_INTERVAL
  ) {
    throw new Error('Invalid state or another watch; preserve it and use a new state path');
  }
  if (acknowledgement) {
    const index = state.pending.findIndex((event) => event.id === acknowledgement);
    if (index < 0) throw new Error('Acknowledgement must identify a pending event');
    state.pending.splice(0, index + 1);
  }
  return state;
}

export function status(state, now = Date.now()) {
  return {
    watchId: state.watchId,
    snapshot: state.snapshot ?? null,
    ageSeconds: state.snapshot
      ? Math.max(0, (now - Date.parse(state.snapshot.observedAt)) / 1000)
      : null,
    stale: !state.snapshot || now >= state.nextPollAt,
    nextPollAt: new Date(state.nextPollAt).toISOString(),
  };
}

// Storage and time are injected so interruption/restart and long waits can be tested without CI.
export async function watch({
  input,
  state = newState(input),
  observe,
  save,
  emit,
  sleep,
  now = Date.now,
  signal,
  once = false,
  heartbeatMs = 0,
}) {
  resume(input, state);
  const delivered = new Set();
  const deliver = async () => {
    for (const event of state.pending) {
      if (delivered.has(event.id)) continue;
      await emit(event);
      delivered.add(event.id);
    }
  };
  await deliver();
  while (!signal?.aborted) {
    const delay = Math.max(0, state.nextPollAt - now());
    if (delay) {
      if (once) return status(state, now());
      try {
        await sleep(delay, signal);
      } catch (error) {
        if (!signal?.aborted) throw error;
        break;
      }
    }
    if (signal?.aborted) break;
    const snapshot = await observe();
    if (signal?.aborted) break;
    const nextFingerprint = fingerprint(snapshot);
    const changed = nextFingerprint !== state.fingerprint;
    state.interval = changed ? INITIAL_INTERVAL : Math.min(MAX_INTERVAL, state.interval * 2);
    state.nextPollAt = Math.max(now() + state.interval, snapshot.retryAt || 0);
    state.snapshot = snapshot;
    state.fingerprint = nextFingerprint;
    const heartbeat = heartbeatMs > 0 && now() - state.lastHeartbeat >= heartbeatMs;
    if (changed || heartbeat) {
      state.sequence++;
      state.pending.push({
        id: `${state.watchId}:${state.sequence}`,
        kind: changed ? 'change' : 'heartbeat',
        snapshot,
      });
      state.lastHeartbeat = now();
    }
    // Commit the outbox before emission; unacknowledged events replay with their original IDs.
    await save(state);
    await deliver();
    if (once || ['successful', 'diverged'].includes(snapshot.state)) break;
  }
  return status(state, now());
}
