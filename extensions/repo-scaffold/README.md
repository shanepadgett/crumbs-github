# Repo Scaffold Extension

Generates deterministic repo tooling, mise tasks, and quiet-validator config.

## User-facing surface

- `/scaffold` opens interactive setup.
- `/scaffold <profile...>` preselects profiles and still asks for versions/conflicts.
- `/scaffold doctor` reports advisory repo setup health.
- `/scaffold refine` queues a proposal-only repo-specific refinement prompt.
- `/scaffold upgrade` inspects existing repo shape, preserves exact pins by default, and adds missing standard wiring safely.

## How it works

Profiles define tools, files, tasks, and quiet-validator scopes. The command resolves exact versions each run, writes pinned config, and never installs tools automatically.
