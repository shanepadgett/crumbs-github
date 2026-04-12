# Runtime Review Criteria

Judge risk relative to app complexity, scale, user expectations. Prefer concrete failures and common-path waste over theoretical edges. Don't flag missing advanced architecture unless code warrants it. Use language overlays for concurrency and framework checks.

## 1. Runtime Correctness

Runtime failures and invalid behavior during normal use.

- Unchecked assumptions: force unwraps/casts, unsafe indexing, invalid nullability, impossible-state logic
- Crash-prone paths: `try!`, `fatalError`, panic fallbacks, assertion misuse in production
- Missing/inconsistent error handling, swallowed failures
- Invalid state transitions, impossible UI states, model/UI drift
- Optional/nullable handling dropping actions, rendering wrong UI, causing partial writes
- Persistence, file I/O, network, decoding leaving inconsistent state
- Don't require defense for implausible states unless failure severe

Severity: high = crash, corruption, broken flow | medium = wrong behavior, lost work, plausible triggers | low = lower-probability gaps

## 2. Performance

Sluggish UI, wasted work, battery/CPU/memory overhead.

- Heavy work on UI/main/latency-sensitive paths
- Repeated recomputation, redundant transforms, duplicate fetch/parse
- `O(n^2)` in user-facing flows
- Excessive allocation churn or serialization in hot paths
- Unbounded task spawning, polling, repeated timers/listeners
- UI invalidation causing unnecessary rerender churn
- Async on wrong execution context for cost
- Don't flag micro-optimizations unless common-path

Severity: high = visible lag, stutter, hangs | medium = inefficiency in moderate paths | low = localized waste

## 3. Concurrency & Threading

Races, stale updates, incorrect UI updates, ownership leaks.

- Missing UI-thread rules for UI-facing state
- Shared mutable state across tasks/threads without isolation
- Non-sendable values crossing async boundaries
- Fire-and-forget work outliving owning feature
- Cancellation not propagated -> stale writes, duplicate work
- Async ordering bugs: older work overwrites newer state
- Cleanup racing main operation or mutating shared state
- Language-specific concurrency escape hatches
- Don't demand extra abstractions when simpler isolation works

Severity: high = races, corruption, crashes | medium = stale data, timing bugs | low = unclear isolation, future risk

## 4. Resource & Lifecycle Management

Leaks and lifecycle mistakes accumulating over time or repeated navigation.

- Retain cycles in closures, listeners, observers, subscriptions, delegates, tasks, callbacks
- Uncleaned resources: files, sockets, streams, timers, notifications, workers
- Long-lived work continuing after owning screen/feature/job gone
- Services recreated vs reused incorrectly
- Storage/history paths growing without limits
- Don't require complex pooling unless behavior justifies

Severity: high = leaks, runaway work, degradation | medium = growth bugs after extended use | low = modest cleanup gaps

## 5. Resilience & Recovery

Weak handling of real-world failures and degraded conditions.

- Service/storage failures without user-safe fallback
- Missing retry/backoff where transient failure expected and user impact matters
- Startup/restore/migration paths stranding app in bad state
- Partial write/sync leaving confusing outcomes
- Offline/interruption gaps for external-service or long-running features
- Errors too vague for recovery or triage
- Don't require distributed-systems resilience for local/low-stakes flows

Severity: high = lost work, stuck, manual recovery | medium = recoverable failure handled poorly | low = diagnosis/rare edge gaps
