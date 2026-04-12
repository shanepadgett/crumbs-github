# Runtime Review Criteria

Apply all sections proportionally. Judge risk in context of app complexity,
scale, and user expectations. Prefer concrete failures and common-path waste
over theoretical edge cases. Do not flag missing advanced architecture,
infrastructure, or optimization unless code clearly warrants it. Use detected
language overlays for exact concurrency and framework checks.

## 1. Runtime Correctness

Look for runtime failures and invalid behavior during normal use.

Checks:

- Unchecked assumptions: force unwraps, force casts, unsafe indexing,
  non-empty assumptions, invalid nullability assumptions, or impossible-state
  logic
- Crash-prone paths: `try!`, `fatalError`, panic-style fallbacks, assertion
  misuse, or hard failure in production code
- Missing or inconsistent error handling, especially swallowed failures
- Invalid state transitions, impossible UI states, or model/UI drift
- Optional or nullable handling that can drop actions, render wrong UI, or
  cause partial writes
- Persistence, file I/O, network, decoding, or serialization code that can
  leave inconsistent state
- Do not require defensive layers for implausible states unless failure would
  be severe

Severity guidance:

- High: likely crash, corrupted state, or broken user flow
- Medium: wrong behavior, lost work, or fragile assumptions with plausible
  triggers
- Low: lower-probability defensive gaps worth hardening

## 2. Performance

Look for code patterns likely to create sluggish UI, wasted work, or battery,
CPU, or memory overhead.

Checks:

- Heavy work on UI, request, main, or latency-sensitive paths
- Repeated recomputation, redundant transforms, duplicate fetch/load work, or
  repeated parsing/formatting
- `O(n^2)` or similarly wasteful patterns in user-facing flows
- Excessive object creation, copying, allocation churn, or serialization in hot
  paths
- Unbounded task spawning, polling, repeated timers, or repeated listeners
- UI invalidation or rerender triggers causing unnecessary churn
- Async work scheduled on wrong execution context for cost involved
- Do not flag micro-optimizations unless common-path or obviously wasteful

Severity guidance:

- High: visible lag, stutter, hangs, or sustained waste in common flows
- Medium: inefficiency in moderately used paths or likely scaling problems
- Low: localized waste with limited user impact

## 3. Concurrency & Threading

Look for async and shared-state issues that can cause races, stale updates,
incorrect UI updates, or ownership leaks.

Checks:

- Missing or unclear UI-thread / main-thread rules for UI-facing state
- Shared mutable state across tasks or threads without clear isolation
- Non-thread-safe or non-sendable values crossing async boundaries unsafely
- Fire-and-forget work that can outlive owning feature unexpectedly
- Cancellation not propagated or ignored, causing stale writes or duplicate
  work
- Async result ordering bugs where older work can overwrite newer state
- Cleanup that races main operation or mutates shared state unsafely
- Language-specific concurrency escape hatches that bypass safety
- Do not demand extra concurrency abstractions when simpler isolation is
  adequate

Severity guidance:

- High: races, corruption, likely crashes, or broken visible updates
- Medium: stale data, duplicate work, or timing-sensitive visible bugs
- Low: unclear isolation that raises future risk more than present failure rate

## 4. Resource & Lifecycle Management

Look for leaks and lifecycle mistakes that accumulate over time or after
repeated navigation or repeated requests.

Checks:

- Retain cycles or ownership leaks in closures, listeners, observers,
  subscriptions, delegates, coroutines, jobs, tasks, or callbacks
- Resources not cleaned up: files, sockets, streams, timers, notifications,
  collectors, subscriptions, workers
- Long-lived work continuing after owning screen, feature, request, or job is
  gone
- Services or caches recreated when they should be reused, or reused when they
  should reset
- Storage, background processing, or history paths that can grow without limits
- Do not require complex pooling or cache hierarchies unless behavior justifies
  it

Severity guidance:

- High: leaks, runaway work, or repeated degradation in common flows
- Medium: growth or lifecycle bugs after extended use or navigation
- Low: cleanup gaps with modest impact today

## 5. Resilience & Recovery

Look for weak handling of real-world failures and degraded conditions.

Checks:

- Network, model, service, or storage failures without user-safe fallback
- Missing retry or backoff where transient failure is expected and user impact
  matters
- Startup, restore, migration, or resume paths that can strand app in bad
  state
- Partial write or partial sync flows that can leave confusing outcomes
- Offline and interruption handling gaps for external-service or long-running
  features
- Logging or surfaced errors too vague for recovery or triage
- Do not require distributed-systems-grade resilience for local or low-stakes
  flows

Severity guidance:

- High: user can lose work, get stuck, or need manual recovery
- Medium: recoverable failure handled poorly or opaquely
- Low: resilience gap that mainly hurts diagnosis or rare edge cases
