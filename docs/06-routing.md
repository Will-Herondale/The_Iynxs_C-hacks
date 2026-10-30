# 06 — Routing, Reachability and Latest-Safe-Departure

## 1. The cost model — stated precisely

For edge `e` at departure time `t` over horizon `[t, T]`:

```
pass(e, τ)      = depth(e, τ) ≤ θ(class(e))  AND  not blocked(e, τ)
w(e, τ)         = length(e) / speed(depth(e, τ))     in seconds
a_e(t)          = t + w_e(t)                       arrival at the far end
```

Two separate quantities must not be conflated:

- **Passability** is binary per point: `max_s d(s) ≤ θ(class)`. Mean depth is physical nonsense — a 1.5 m channel across a 300 m causeway averages to passable.
- **Cost** is an integral: `w = ∫ ds / v(d(s))`, i.e. a harmonic mean of speed along the geometry, not `v(mean d)`.

Depth values `d(e, τ)` come from the flood projection at fixed slots; blockages from valid-time observations. Depth sampling is every 15 m along the geometry plus both endpoints; bridges use `S − deck_elev` rather than terrain depth.

## 2. Time-expanded DAG — the recommended algorithm

Verified during review: rising stage is strictly FIFO, but road *re-emergence* and *blockage expiry* are downward cost jumps, which break plain time-dependent Dijkstra. Waiting at nodes restores monotonicity and is physically correct (vehicles hold at junctions and high ground).

```
slot length = 60 s
states       = (node, k)   where k = slot index, t_k = t0 + k·60s
arc (u,k) → (v,k')   if pass(e, τ) for all τ in [t_k, t_k'] and k' = k + ceil(w/60)
wait (u,k) → (u,k+1) if pass_slot(u,k) AND pass_slot(u,k+1)
```

Every arc strictly increases `k`, so the graph is a **DAG**. Shortest path = reverse DP in `O(V+E)` — no heap, no relaxation pitfalls.

Per-stage expanded size for Majuli: ~2000 nodes × K slots. K = 7 (30 min @ 5-min depth slots) → ~21 k states, ~56 k arcs → ~10 ms per run. K = 288 (full day) → ~864 k states → 1–2 s per run. Either is fine offline.

## 3. Requirement 1 — fastest path A→B departing at t0

```
path = forward_dp((A, k0))          // replay cost exactly
assert exact_replay(path):          // 20-line hard check
    for e in path:
        for τ in arange(entry(e), exit(e), 30 s):
            assert depth(e, τ) ≤ θ(class(e))   // safety holds while actually on the edge
return { path, eta_minutes, departures, waits }
```

Entry-time-only checking is insufficient — the route must be safe while the vehicle is on each edge. This is the demo's core claim and it is enforced by assertion.

## 4. Requirement 2 — latest safe departure

```
Condition for binary search: arrival function A(t0) non-decreasing — holds iff waiting at nodes is allowed.
Without waiting the feasible set is {✓, ✗, ✓} — binary search silently returns wrong t*.
```

Correct implementation: reverse sweep, not binary search:

```
L[v][k] = latest departure slot at node v that still arrives by deadline T
reverse_dp_from((shelter, K)) over all nodes in one O(V+E) pass
for each settlement v: t*[v] = max { k : L[v][k] ≤ deadline }
```

Output includes the wait schedule (`depart at t*, hold at node X, resume`) — reporting a `t*` that requires an unstated hold is operationally false.

Binary search + forward search is O(log(H/ε)·E log V) and wrong without waiting; reverse sweep is O(E log V), all nodes at once, exact. Binary search is rejected.

## 5. Requirement 3 — settlement reachability and cut-off list

One reverse sweep per shelter (≈20 shelters) fills `L[shelter][v][k]` for all settlements and all slots:

```
for each settlement v, each shelter s:
    reachable[v][s] = min arrival over all k with L[s][v][k] defined
cut_off[v] = { shelters with no reachable path at any slot }
first_submerge[v] = edge on v's route whose pass-slot ends earliest
```

Complexity: 20 shelters × ~10 ms = ~200 ms for the whole table. A naive all-pairs forward search (200 settlements × 20 shelters × 0.3 s ≈ 20 min) is infeasible for a live demo and is rejected.

## 6. Failure modes caught cheaply

| Failure | Test |
|---|---|
| Route crosses a road while submerged | `exact_replay` at 30 s resolution on every returned path — hard assert |
| `∞` cost rendered as a number | Sentinel filter: fully submerged graph → zero reachable shelters |
| Latest-departure answer requires an unstated wait | Assert every `t*` emits `(depart, hold_at, resume)` tuple |
| Plain Dijkstra used on expiring blockages | Golden 4-node toy with hand-computed answer (blockage window [10:00, 10:30)) |
| Depth semantics wrong (mean instead of max) | Unit test: 300 m causeway, 1.5 m centre → impassable |
