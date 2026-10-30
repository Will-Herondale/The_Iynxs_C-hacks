# 04 — Offline Synchronisation Protocol

## 1. State model

Each replica holds:

```
log        : Envelope[]            // append-only, ordered by (origin, seq) on read
hwm        : Map<origin, number>   // highest CONTIGUOUS seq seen from that origin
holes      : Map<origin, Set<number>>   // seqs seen but not yet contiguous
seen       : Set<id>               // membership test
```

`hwm` is not "highest seen" — it is "highest *contiguous* seen". A replica that received seq 7 but not 6 is at 5 with a hole at 6. This is what makes chunk loss self-healing.

## 2. Why per-origin sequence, not a global counter

A single global counter is unusable once events are relayed:

- Replica A's local #500 and replica B's local #500 are different events.
- After A relays B's events, A's local numbering no longer corresponds to anyone's counter.
- You cannot express partial progress: "current with B, 400 behind A" is inexpressible.
- One idle origin blocks all progress for every peer.

`origin` is the **creator**, preserved verbatim through any relay. `seq` is that device's gap-free counter. Identity is `(origin, seq)`.

## 3. Messages

```ts
// POST /sync — one round trip, both directions
type SyncRequest = {
  proto: 1;
  replica_id: string;
  vv: Record<string, number>;   // requester's contiguous hwm, per origin
  push: Envelope[];             // may be empty; capped at 500
  limit?: number;               // default 500, max 500
};

type SyncResponse = {
  proto: 1;
  from: string;
  vv: Record<string, number>;   // responder's hwm after ingesting push
  events: Envelope[];           // ordered by (origin, seq)
  more: boolean;                // true => issue another round immediately
  rejected: Array<{ id: string; reason: string }>;  // quarantine, never silent
};
```

## 4. Responder algorithm

```
ingest(push)                       // validates, dedupes, detects holes
ors = union(keys(responder.hwm), keys(request.vv))
out = []
for o in sort(ors):
    from = request.vv[o] ?? 0      // unknown origin => from 1. THIS is transitive relay.
    to   = responder.hwm[o] ?? 0
    for s in (from+1 .. to):
        if s not in responder.holes_for(o): out.push(event(o,s))
        if len(out) == limit: return {events: out, more: true}
return {events: out, more: false}
```

The `?? 0` line is the whole of transitive propagation: a requester that has never seen origin `C` is simply 0 events into `C`, and receives everything the responder holds from `C` — including events `C` created and events `C` merely relayed.

## 5. Receiver algorithm

```
for e in events:
    if e.hash invalid or payload invalid: rejected.push; continue
    if exists(origin=e.origin, seq=e.seq):
        if stored.hash != e.hash: integrity_alert(collision); continue
        else: continue                       // idempotent
    if e.seq > hwm[e.origin] + 1: holes[e.origin].add(e.seq); store; continue
    store; hwm[e.origin] = e.seq
    while holes[e.origin].has(hwm[e.origin]+1): hwm[e.origin]++; holes.delete(hwm)
advance local vv
```

Out-of-order arrival, duplicate delivery, partial chunks and process death mid-batch all converge to the same state. Nothing here requires ordering guarantees from the transport.

## 6. Sneakernet

The field app can export the sync *response body* for a given `vv` as a gzipped file, and import one. Import runs the identical codec. This is not a gimmick: in a real flood, one person walking a USB stick between two camps is the actual transport, and it costs ~30 lines because the response is already a self-contained byte string.

## 7. Convergence harness (the demo beat)

```python
def harness(seed, n_replicas=5, n_events=400, rounds=40, slots=6):
    rng = Random(seed)
    reps = [Replica(i) for i in range(n_replicas)]
    for _ in range(n_events):
        rng.choice(reps).local_event(random_type(rng), random_payload(rng))
    for _ in range(rounds):
        for _ in range(rng.randint(1, 6)):
            a, b = rng.choice(reps), rng.choice(reps)
            if a is b: continue
            delta = a.events_since(b.vv)
            rng.shuffle(delta)                              # out of order
            if rng.random() < 0.20: delta += rng.sample(delta, len(delta)//3)   # dups
            if rng.random() < 0.10 and len(delta) > 1: delta = delta[:len(delta)//2]  # truncation
            b.ingest(delta)
        for r in reps:
            if rng.random() < 0.05:
                r.crash_mid_write(); r.recover(); assert r.log_valid()
    for _ in range(60):                                     # final anti-entropy
        for a in reps:
            for b in reps:
                if a is not b: b.ingest(a.events_since(b.vv))
        if len({tuple(sorted(r.vv.items())) for r in reps}) == 1: break
    assert len({r.revision() for r in reps}) == 1, "DIVERGED"
    for r in reps:                                          # cross-process determinism
        assert Replica.reload(r.id).revision() == r.revision()
```

`r.revision()` = `sha256(canonicalJson(project(r.events, asOf)))` over the **same** `asOf` for all replicas.

### Negative controls — what makes the demo convincing

Run the same harness against deliberately broken builds and assert each **fails**:

| Broken build | Must fail with |
|---|---|
| Fold in arrival order instead of canonical order | differing `revision` |
| Accumulate depths as floating point | differing `revision` |
| Drop the last event of each chunk | differing `revision` |
| Use `Date.now()` inside the fold | differing `revision` |

One red, one green, same harness, same seed. Without the negative controls, a green test proves nothing — it might be green because the harness is broken.

## 8. Failure handling, ordered by necessity

| Failure | 48 h? | Mechanism |
|---|---|---|
| Duplicate delivery | **must** | identity check `(origin, seq)` + `hash` |
| Out-of-order / chunk loss | **must** | holes table, contiguous hwm |
| Clock skew | **must** | HLC monotonicity + `observed_at` clamp + `suspect_clock` |
| Torn write / crash mid-append | **must** | append full line + `fsync`; truncated trailing line discarded on load |
| Storage full | **must** | pre-flight byte check; refuse to append rather than half-write |
| Event flood from one device | **must** | 64 KB max event, 500 max per request, per-device disable switch |
| Signature forgery | **should** | ed25519 per device, roster genesis event, quarantine unverified |
| Cloned `device_id` (restored backup) | **should** | `UNIQUE(origin, seq)` violation is loud; regenerate id+key on first boot |
| Log growth / compaction | **defer** | unbounded growth; disclose as a 3-month risk, not a 48-hour one |
| Key rotation, revocation | **defer** | |
| Byzantine devices | **defer** | an authorised malicious device is undetectable; say so |
| Transport confidentiality | **defer** | TLS on the local wifi; no E2E encryption claim |

## 9. What we do not claim

- Not "CRDT" as a hand-wave. The merge is a grow-only set union plus a pure fold; the reviewed-merge step is deliberately *not* convergent until a human acts, which is why the decision is an event.
- Not Byzantine fault tolerant.
- Not secure against a compromised authorised device.
- Convergence is guaranteed for the **event set** and for the **fold given the same set**. It is not a guarantee that every replica has every event at any instant — only that `hwm` and `revision` visibly report the gap.
