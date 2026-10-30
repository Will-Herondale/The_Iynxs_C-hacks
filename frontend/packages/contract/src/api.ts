import type { EventRecord, FieldEvent, FieldEventType } from './events.js';
import type { ProjectionSnapshot } from './projections.js';
import type { EventStatus, SubmitAck } from './sync.js';

export interface ListEventsParams {
  sinceVersion?: number;
  limit?: number;
  type?: FieldEventType;
}

/**
 * The ONLY way apps talk to the backend. Methods may reject with NetworkError,
 * ServerError, TimeoutError (all retryable) or NotImplementedError.
 */
export interface ApiClient {
  /** Per-item acks, same order as input. `accepted` is NOT `synced`. */
  submitEvents(events: FieldEvent[]): Promise<SubmitAck[]>;
  getEventStatus(clientEventIds: string[]): Promise<EventStatus[]>;
  getProjections(sinceVersion?: number): Promise<ProjectionSnapshot>;
  listEvents(params?: ListEventsParams): Promise<EventRecord[]>;
  /** Notifies when the projection/event feed version changes. Returns unsubscribe. */
  subscribe(onChange: (snapshotVersion: number) => void): () => void;
}
