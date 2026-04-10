# Codex Compat Extension

Minimal Codex compatibility mode for Pi.

It does three things:

- keeps builtin `read` and `bash` active
- suppresses builtin `edit` and `write`, then provides `apply_patch` and `view_image` (when supported)
- preserves custom repo tools (for example `webresearch` and `memory_recall`) and restores the prior tool set when you switch away from a supported model

`apply_patch` now supports Codex-style behavior for parser and matcher semantics inside the current cwd guard, including:

- `*** End of File` markers in update chunks
- first update chunk omission of initial `@@`
- pure-addition update chunks inserting at EOF
- lenient matching passes (exact, trim-end, trim, Unicode punctuation/spacing normalization)
- explicit invocation envelopes like `apply_patch <<'PATCH'` and `applypatch <<'PATCH'` (plus shell wrappers)

## How to use it

Install/enable the extension, then select a supported Codex-family model.

Compatibility mode activates automatically on model select/session start and updates the agent prompt with apply-patch focused guidance.

## Example

- Select `openai/gpt-5.3-codex`.
- Ask Pi to edit files with `apply_patch`.
- Ask Pi to inspect a screenshot with `view_image`.
