// SETU IndexedDB Schema for Offline-First Operation
// Defines the local persistence layer for field events and projections

const DB_NAME = 'setu-offline';
const DB_VERSION = 1;

const SCHEMA = {
  // Field events store - append-only, idempotent
  fieldEvents: {
    keyPath: 'clientEventId',
    indexes: [
      { name: 'origin', keyPath: 'origin', unique: false },
      { name: 'seq', keyPath: 'seq', unique: false },
      { name: 'type', keyPath: 'type', unique: false },
      { name: 'observedAt', keyPath: 'observedAt', unique: false },
      { name: 'synced', keyPath: 'synced', unique: false },
    ],
  },
  // Sync state - version vectors per origin
  syncState: {
    keyPath: 'origin',
    indexes: [],
  },
  // Projections cache - last computed snapshot
  projections: {
    keyPath: 'version',
    indexes: [
      { name: 'generatedAt', keyPath: 'generatedAt', unique: false },
    ],
  },
  // Offline geo data - bundled HAND artifacts
  geoData: {
    keyPath: 'key',
    indexes: [],
  },
  // Sync log - tracks sync attempts
  syncLog: {
    keyPath: 'id',
    indexes: [
      { name: 'timestamp', keyPath: 'timestamp', unique: false },
      { name: 'status', keyPath: 'status', unique: false },
    ],
  },
};

/**
 * Initialize IndexedDB for SETU offline operation.
 * Returns a promise that resolves when the database is ready.
 */
function initOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Field events store
      if (!db.objectStoreNames.contains('fieldEvents')) {
        const store = db.createObjectStore('fieldEvents', { keyPath: SCHEMA.fieldEvents.keyPath });
        for (const idx of SCHEMA.fieldEvents.indexes) {
          store.createIndex(idx.name, idx.keyPath, { unique: idx.unique });
        }
      }

      // Sync state store
      if (!db.objectStoreNames.contains('syncState')) {
        db.createObjectStore('syncState', { keyPath: SCHEMA.syncState.keyPath });
      }

      // Projections cache
      if (!db.objectStoreNames.contains('projections')) {
        const store = db.createObjectStore('projections', { keyPath: SCHEMA.projections.keyPath });
        for (const idx of SCHEMA.projections.indexes) {
          store.createIndex(idx.name, idx.keyPath, { unique: idx.unique });
        }
      }

      // Geo data store
      if (!db.objectStoreNames.contains('geoData')) {
        db.createObjectStore('geoData', { keyPath: SCHEMA.geoData.keyPath });
      }

      // Sync log store
      if (!db.objectStoreNames.contains('syncLog')) {
        const store = db.createObjectStore('syncLog', { keyPath: SCHEMA.syncLog.keyPath, autoIncrement: true });
        for (const idx of SCHEMA.syncLog.indexes) {
          store.createIndex(idx.name, idx.keyPath, { unique: idx.unique });
        }
      }
    };
  });
}

/**
 * Field event record for IndexedDB.
 * Matches the wire format (FieldEvent) from the integration contract.
 */
const FIELD_EVENT_RECORD = {
  clientEventId: '',       // UUID v4, stable identity
  origin: '',              // device identifier
  seq: 0,                  // sequence number per origin
  type: '',                // event type (obs.water, road_blockage, etc.)
  payload: {},             // event-specific payload
  observedAt: '',           // ISO 8601 timestamp
  hlc: { l: 0, c: 0, n: '' }, // hybrid logical clock
  vv: {},                  // version vector
  synced: false,           // whether synced to server
  syncAttempts: 0,         // number of sync attempts
  lastSyncAttempt: null,   // timestamp of last sync attempt
  syncError: null,         // last sync error
  createdAt: '',           // local creation timestamp
};

/**
 * Sync state record for IndexedDB.
 */
const SYNC_STATE_RECORD = {
  origin: '',              // device identifier
  hwm: 0,                  // high water mark (last seq applied)
  vv: {},                  // version vector
  lastSyncAt: null,        // last successful sync timestamp
  lastSyncVersion: 0,      // last sync projection version
};

/**
 * Projection cache record for IndexedDB.
 */
const PROJECTION_CACHE_RECORD = {
  version: 0,              // projection version
  generatedAt: '',         // ISO timestamp
  flood: {},               // GeoJSON FeatureCollection
  roads: {},               // GeoJSON FeatureCollection
  settlements: {},         // GeoJSON FeatureCollection
  routes: {},              // GeoJSON FeatureCollection
  shelters: {},            // GeoJSON FeatureCollection
  cachedAt: '',            // when cached locally
};

/**
 * Geo data record for IndexedDB.
 */
const GEO_DATA_RECORD = {
  key: '',                 // 'majuli_hand_bundle'
  data: {},                // bundled geo data
  loadedAt: '',            // when loaded
  version: '',             // bundle version
};

/**
 * Sync log record for IndexedDB.
 */
const SYNC_LOG_RECORD = {
  id: 0,                   // auto-increment
  timestamp: '',           // ISO timestamp
  status: '',              // 'success', 'failure', 'partial'
  eventsSent: 0,           // number of events sent
  eventsAcked: 0,          // number of events acknowledged
  error: null,             // error message if failed
  duration: 0,             // sync duration in ms
};

// Export schema for use by frontend
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DB_NAME,
    DB_VERSION,
    SCHEMA,
    FIELD_EVENT_RECORD,
    SYNC_STATE_RECORD,
    PROJECTION_CACHE_RECORD,
    GEO_DATA_RECORD,
    SYNC_LOG_RECORD,
    initOfflineDB,
  };
}
