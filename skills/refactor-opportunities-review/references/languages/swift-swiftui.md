# Swift / SwiftUI Overlay

Use with generic lens criteria. Refine findings for Swift and SwiftUI repos.

## Hygiene

- Prefer clear type names. Flag generic names like `Manager`, `Helper`,
  `Utility`, `Service`, `Handler` without domain prefix.
- Flag mixed old and new state models when migration path is clear:
  `ObservableObject` / `@Published` with `@Observable`, `@StateObject` /
  `@ObservedObject` with `@State` / `@Bindable`.
- Flag `AnyView` where `@ViewBuilder` or `some View` is clearer.
- Flag very long `body` implementations that should become subviews.
- Flag `GeometryReader` or rigid frame sizing when modern layout APIs would be
  clearer.
- Flag excessive extension sprawl on one type across many files.
- Prefer current Swift syntax when it improves clarity: if/switch expressions,
  typed throws where established locally, `package` in multi-module repos.

## Over-Engineering

- Flag single-conformer protocols and pass-through wrappers with weak payoff.
- Flag coordinators, routers, or services added for tiny local SwiftUI flows.
- Flag view-model layers that mainly mirror view state with no real boundary.
- Flag Combine pipelines retained only by inertia when `async/await` would be
  simpler.
- Flag homegrown infrastructure around persistence, observation, or navigation
  that exceeds app needs.

## Runtime

- Flag `@unchecked Sendable` and actor-isolation workarounds.
- Flag `Task {}` work that unintentionally stays on `MainActor`.
- Flag UI updates from wrong isolation context.
- Flag retain cycles in closures, timers, publishers, and long-lived tasks.
- Flag repeated work in `body`, expensive formatting/parsing on main thread,
  and unnecessary invalidation churn.
- Flag file I/O, persistence, backup, restore, and model-runtime paths that can
  leave inconsistent state.
