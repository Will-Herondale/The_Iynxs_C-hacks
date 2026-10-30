// SETU Offline Sync Module
// Handles idempotent synchronization between local IndexedDB and server
// Supports offline-first operation with eventual consistency

/**
 * Sync protocol:
 * 1. Collect unsynced field events from IndexedDB
 * 2. Batch submit to server via POST /api/v1/events:batch
 * 3. Process acks: mark accepted events as synced
 * 4. Handle conflicts: server wins for same origin+seq
 * 5. Pull updated projections via GET /api/v1/projections
 * 6. Update local projection cache
 *
 * Idempotency:
 * - clientEventId is stable across retries
 * - Server deduplicates by clientEventId
 * - Version vectors prevent duplicate application
 *
 * Offline-first guarantees:
 * - Field events are persisted to IndexedDB before any network attempt
 * - Events survive page reloads and browser restarts
 * - Sync is attempted when online, deferred when offline
 * - Last successful sync time is tracked
 * - Stale data warnings when sync is overdue
 */

const SYNC_CONFIG = {
  maxBatchSize: 500,
  maxEventSize: 64 * 1024, // 64KB
  syncIntervalMs: 30000,    // 30 seconds
  staleThresholdMs: 300000, // 5 minutes
  retryBackoffMs: [1000, 2000, 4000, 8000, 16000],
  maxRetries: 5,
};

/**
 * Collect unsynced events from IndexedDB.
 */
async function collectUnsyncedEvents(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('fieldEvents', 'readonly');
    const store = tx.objectStore('fieldEvents');
    const index = store.index('synced');
    const request = index.getAll(false); // synced = false
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Submit events to server.
 */
async function submitEvents(baseUrl, events) {
  const response = await fetch(baseUrl + '/api/v1/events:batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  });
  if (!response.ok) throw new Error('Sync failed: ' + response.status);
  return response.json();
}

/**
 * Check event sync status.
 */
async function checkEventStatus(baseUrl, clientEventIds) {
  const response = await fetch(baseUrl + '/api/v1/events/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientEventIds }),
  });
  if (!response.ok) throw new Error('Status check failed: ' + response.status);
  return response.json();
}

/**
 * Fetch updated projections.
 */
async function fetchProjections(baseUrl, sinceVersion) {
  const url = baseUrl + '/api/v1/projections' + (sinceVersion ? '?sinceVersion=' + sinceVersion : '');
  const response = await fetch(url);
  if (response.status === 304) return null; // Not modified
  if (!response.ok) throw new Error('Projection fetch failed: ' + response.status);
  return response.json();
}

/**
 * Main sync function.
 */
async function sync(db, baseUrl) {
  const syncStart = Date.now();
  let eventsSent = 0;
  let eventsAcked = 0;

  try {
    // 1. Collect unsynced events
    const unsynced = await collectUnsyncedEvents(db);
    if (unsynced.length === 0) {
      // Nothing to sync, just pull projections
      const projections = await fetchProjections(baseUrl, 0);
      if (projections) {
        await cacheProjections(db, projections);
      }
      await logSync(db, 'success', 0, 0, null, Date.now() - syncStart);
      return { success: true, eventsSent: 0, eventsAcked: 0 };
    }

    // 2. Batch submit
    const batches = [];
    for (let i = 0; i < unsynced.length; i += SYNC_CONFIG.maxBatchSize) {
      batches.push(unsynced.slice(i, i + SYNC_CONFIG.maxBatchSize));
    }

    for (const batch of batches) {
      const wireEvents = batch.map((e) => ({
        clientEventId: e.clientEventId,
        origin: e.origin,
        seq: e.seq,
        type: e.type,
        payload: e.payload,
        observedAt: e.observedAt,
        hlc: e.hlc,
        vv: e.vv,
      }));

      const acks = await submitEvents(baseUrl, wireEvents);
      eventsSent += batch.length;

      // 3. Process acks
      const tx = db.transaction('fieldEvents', 'readwrite');
      const store = tx.objectStore('fieldEvents');

      for (const ack of acks.acks) {
        const event = batch.find((e) => e.clientEventId === ack.clientEventId);
        if (!event) continue;

        if (ack.result === 'accepted' || ack.result === 'duplicate') {
          event.synced = true;
          event.lastSyncAttempt = new Date().toISOString();
          event.syncError = null;
          eventsAcked++;
          store.put(event);
        } else if (ack.result === 'rejected' || ack.result === 'conflict') {
          event.syncError = ack.reason || 'Rejected by server';
          event.lastSyncAttempt = new Date().toISOString();
          store.put(event);
        }
      }

      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }

    // 4. Pull updated projections
    const projections = await fetchProjections(baseUrl, 0);
    if (projections) {
      await cacheProjections(db, projections);
    }

    // 5. Update sync state
    await updateSyncState(db, baseUrl, Date.now());

    await logSync(db, 'success', eventsSent, eventsAcked, null, Date.now() - syncStart);
    return { success: true, eventsSent, eventsAcked };

  } catch (error) {
    await logSync(db, 'failure', eventsSent, eventsAcked, error.message, Date.now() - syncStart);
    return { success: false, eventsSent, eventsAcked, error: error.message };
  }
}

/**
 * Cache projections in IndexedDB.
 */
async function cacheProjections(db, projections) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projections', 'readwrite');
    const store = tx.objectStore('projections');
    const record = {
      version: projections.version,
      generatedAt: projections.generatedAt,
      flood: projections.flood,
      roads: projections.roads,
      settlements: projections.settlements,
      routes: projections.routes,
      shelters: projections.shelters,
      cachedAt: new Date().toISOString(),
    };
    store.put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Update sync state.
 */
async function updateSyncState(db, baseUrl, timestamp) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncState', 'readwrite');
    const store = tx.objectStore('syncState');
    const record = {
      origin: 'local',
      hwm: 0,
      vv: {},
      lastSyncAt: new Date(timestamp).toISOString(),
      lastSyncVersion: 0,
    };
    store.put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Log sync attempt.
 */
async function logSync(db, status, eventsSent, eventsAcked, error, duration) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncLog', 'readwrite');
    const store = tx.objectStore('syncLog');
    const record = {
      timestamp: new Date().toISOString(),
      status,
      eventsSent,
      eventsAcked,
      error,
      duration,
    };
    store.add(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get last successful sync time.
 */
async function getLastSyncTime(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncLog', 'readonly');
    const store = tx.objectStore('syncLog');
    const index = store.index('status');
    const request = index.getAll('success');
    request.onsuccess = () => {
      const successes = request.result;
      if (successes.length === 0) {
        resolve(null);
      } else {
        const last = successes[successes.length - 1];
        resolve(last.timestamp);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Check if data is stale.
 */
async function isDataStale(db) {
  const lastSync = await getLastSyncTime(db);
  if (!lastSync) return true;
  const elapsed = Date.now() - new Date(lastSync).getTime();
  return elapsed > SYNC_CONFIG.staleThresholdMs;
}

/**
 * Offline-first status.
 */
function getOfflineStatus() {
  return {
    online: navigator.onLine,
    serviceWorkerReady: 'serviceWorker' in navigator,
    indexedDBAvailable: 'indexedDB' in window,
  };
}

// Export for use by frontend
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SYNC_CONFIG,
    collectUnsyncedEvents,
    submitEvents,
    checkEventStatus,
    fetchProjections,
    sync,
    cacheProjections,
    updateSyncState,
    logSync,
    getLastSyncTime,
    isDataStale,
    getOfflineStatus,
  };
}
"