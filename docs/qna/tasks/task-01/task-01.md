# Task 01 — Shared runtime request protocol, validation, and form launch

## Overview

Build the shared low-level request pipeline that both `/qna` and `/grill-me` use to open structured question forms. This task establishes the authorized absolute-path protocol, deterministic validation, hidden repair messaging, retry budgeting, request locking, and the first tabbed runtime shell that launches from a valid request.

## Grouping methodology

Everything here is pre-product infrastructure. It is one committable and testable unit because a minimal one-question request can prove the full request lifecycle end to end before any QnA inbox extraction or Grill Me session behavior exists.

## Dependencies

- None.

## Parallelization

- Completion of this task unblocks every later task.

## Spec coverage

### `docs/qna/question-runtime-core-spec.md`

- The system shall use this runtime as shared infrastructure for `/qna` and `/grill-me`.
- The system shall keep product-specific workflow and storage policy out of this shared spec.
- The shared runtime shall own only low-level structured-question request protocol, validation, retry control, and question-form rendering.
- Product-specific no-question outcomes and terminal screens shall remain product-owned rather than extending the shared question runtime protocol.
- The shared runtime authorized-question tool shall remain distinct from any product-level agent tool.
- Each question shall have a stable `questionId` owned by the calling extension.
- The shared runtime shall validate caller-supplied `questionId`s but shall not generate or reconcile them.
- The system shall allow per-run presentation fields to change without changing the stable `questionId`.
- Every `multiple_choice` option shall have a stable `optionId` separate from its display label.
- The shared runtime shall validate caller-supplied `optionId`s but shall not generate or reconcile them.
- When a resurfaced `multiple_choice` option keeps the same meaning, the system shall preserve its `optionId` across rewrites.
- The calling extension shall own `optionId`s and shall pass existing `optionId`s into reconciliation so same-meaning options keep their IDs and only truly new options get new IDs.
- The system shall present the question form in a tab-oriented interface.
- The system shall use a cleaner UI and shall not use the current robot icon.
- When the agent needs to ask structured questions, the system shall require use of an authorized question tool flow rather than arbitrary file watching.
- When the authorized question tool is called, the system shall issue a request ID and a tool-usable absolute JSON path rooted in a project-local temp location, and it may also return a repo-relative display path.
- The system shall require the agent to write the structured question spec to that authorized path rather than to an arbitrary file.
- The structured question spec shall contain the full question graph needed for the current request.
- The structured question spec shall contain at least one renderable question.
- The structured question spec shall not encode product-level loop-control or terminal-screen semantics.
- The system shall require the structured question spec to be deterministic for the known fields the UI depends on.
- The system shall ignore unknown extra fields in an otherwise valid JSON file.
- When the authorized file is created or edited, the system shall validate the current JSON immediately.
- When the authorized file is valid, the system shall present the question UI immediately.
- When the authorized file is invalid, the system shall send hidden repair feedback to the agent instead of opening the UI.
- The system shall allow the agent to repair the authorized file in place with its normal file-editing tools.
- When a valid authorized request has been consumed and the UI has been shown, the system shall lock that request ID so later edits to the same file do not reopen it.
- When a product flow has no renderable questions for the current step, it shall handle that outcome without launching the shared question runtime form.
- When validation fails, the system shall send a hidden custom message rather than a visible user message.
- When validation fails, the hidden custom message shall include the same request ID and authorized path.
- When validation fails, the hidden custom message shall describe the field path, expected shape, actual problem, and a concise fix hint for every deterministic error the validator can report.
- When the agent repeatedly fails to produce a valid authorized file, the system shall enforce a hidden retry budget of 4 failed validations.
- When the hidden retry budget is exhausted, the system shall ask the user whether to continue or abort that request.
- While the retry-exhaustion decision is pending, later edits to that same authorized request shall be ignored.
- When the user chooses Continue after the retry budget is exhausted, the system shall grant exactly one additional block of 4 hidden retries.
- When the user chooses Abort after the retry budget is exhausted, the system shall stop that request.

### `docs/qna/grill-me-interview-spec.md`

- `/grill-me` shall share only the low-level question runtime with `/qna`.

## Expected end-to-end outcome

- A valid authorized question request opens a shared tabbed form shell immediately.
- Invalid request files never flash broken UI to the user and instead drive a hidden repair loop with deterministic error feedback and bounded retries.
- Once a request has been consumed, later edits to the same authorized file do not reopen the form.

## User test at exit

1. Trigger the authorized question tool and receive a request ID plus tool-usable project-local path.
2. Write invalid JSON and confirm the agent receives hidden repair feedback with the request ID, path, field errors, and fix hints.
3. Exhaust four failed validations and confirm the user sees a Continue or Abort choice, then confirm later edits are ignored until the user decides.
4. Repair the file, confirm the form opens, then edit the same file again and confirm it stays locked.
