import type { ExtensionAPI, SessionEntry } from "@mariozechner/pi-coding-agent";
import {
  QUESTION_RUNTIME_STATE_ENTRY,
  type QuestionRuntimeStateSnapshot,
  type RuntimeRequestRecord,
} from "./types.js";

const RETRY_BLOCK_SIZE = 4;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloneRecord(record: RuntimeRequestRecord): RuntimeRequestRecord {
  return {
    ...record,
    path: record.path,
    projectRelativePath: record.projectRelativePath,
  };
}

function toSnapshot(records: RuntimeRequestRecord[]): QuestionRuntimeStateSnapshot {
  return {
    requests: records.map(cloneRecord),
  };
}

function isRuntimeRequestStatus(value: unknown): value is RuntimeRequestRecord["status"] {
  return value === "pending" || value === "ready" || value === "locked" || value === "aborted";
}

function parseRecord(value: unknown): RuntimeRequestRecord | null {
  if (!isObject(value)) return null;
  if (typeof value.requestId !== "string" || !value.requestId.trim()) return null;
  if (typeof value.path !== "string" || !value.path.trim()) return null;
  if (typeof value.projectRelativePath !== "string" || !value.projectRelativePath.trim())
    return null;
  if (!isRuntimeRequestStatus(value.status)) return null;

  const failureCount =
    typeof value.failureCount === "number" && Number.isFinite(value.failureCount)
      ? Math.max(0, Math.floor(value.failureCount))
      : 0;
  const extraRetryBlocksGranted =
    typeof value.extraRetryBlocksGranted === "number" &&
    Number.isFinite(value.extraRetryBlocksGranted)
      ? Math.max(0, Math.floor(value.extraRetryBlocksGranted))
      : 0;
  const pendingRetryDecision = value.pendingRetryDecision === true;
  const lastProcessedContentHash =
    typeof value.lastProcessedContentHash === "string" && value.lastProcessedContentHash.trim()
      ? value.lastProcessedContentHash
      : undefined;

  return {
    requestId: value.requestId,
    path: value.path,
    projectRelativePath: value.projectRelativePath,
    status: value.status,
    failureCount,
    extraRetryBlocksGranted,
    pendingRetryDecision,
    lastProcessedContentHash,
  };
}

function parseSnapshot(value: unknown): QuestionRuntimeStateSnapshot | null {
  if (!isObject(value) || !Array.isArray(value.requests)) return null;
  const requests: RuntimeRequestRecord[] = [];

  for (const item of value.requests) {
    const parsed = parseRecord(item);
    if (parsed) requests.push(parsed);
  }

  return { requests };
}

export interface ShouldProcessResult {
  process: boolean;
  reason?: "missing" | "locked" | "aborted" | "pending_retry" | "duplicate_hash";
  record?: RuntimeRequestRecord;
}

export interface RecordInvalidResult {
  record: RuntimeRequestRecord;
  allowedFailures: number;
  exhaustionReached: boolean;
}

export class QuestionRuntimeRequestStore {
  private byRequestId = new Map<string, RuntimeRequestRecord>();
  private byPath = new Map<string, string>();
  private seenHashesByRequestId = new Map<string, Set<string>>();

  constructor(private readonly pi: ExtensionAPI) {}

  hydrateFromBranch(entries: SessionEntry[]): void {
    let latest: QuestionRuntimeStateSnapshot | null = null;

    for (const entry of entries) {
      if (entry.type !== "custom" || entry.customType !== QUESTION_RUNTIME_STATE_ENTRY) continue;
      const parsed = parseSnapshot(entry.data);
      if (!parsed) continue;
      latest = parsed;
    }

    this.byRequestId.clear();
    this.byPath.clear();
    this.seenHashesByRequestId.clear();

    for (const record of latest?.requests ?? []) {
      this.byRequestId.set(record.requestId, cloneRecord(record));
      this.byPath.set(record.path, record.requestId);
      if (record.lastProcessedContentHash) {
        this.seenHashesByRequestId.set(
          record.requestId,
          new Set([record.lastProcessedContentHash]),
        );
      }
    }
  }

  getSnapshot(): QuestionRuntimeStateSnapshot {
    return toSnapshot(this.getAllRecords());
  }

  getAllRecords(): RuntimeRequestRecord[] {
    return [...this.byRequestId.values()].map(cloneRecord);
  }

  getRecordByRequestId(requestId: string): RuntimeRequestRecord | undefined {
    const record = this.byRequestId.get(requestId);
    return record ? cloneRecord(record) : undefined;
  }

  getRecordByPath(path: string): RuntimeRequestRecord | undefined {
    const requestId = this.byPath.get(path);
    if (!requestId) return undefined;
    return this.getRecordByRequestId(requestId);
  }

  getKnownPaths(): string[] {
    return [...this.byPath.keys()];
  }

  addPendingRequest(
    record: Pick<RuntimeRequestRecord, "requestId" | "path" | "projectRelativePath">,
  ): void {
    if (this.byRequestId.has(record.requestId)) return;

    const next: RuntimeRequestRecord = {
      requestId: record.requestId,
      path: record.path,
      projectRelativePath: record.projectRelativePath,
      status: "pending",
      failureCount: 0,
      extraRetryBlocksGranted: 0,
      pendingRetryDecision: false,
      lastProcessedContentHash: undefined,
    };

    this.byRequestId.set(next.requestId, next);
    this.byPath.set(next.path, next.requestId);
    this.seenHashesByRequestId.set(next.requestId, new Set());
    this.persist();
  }

  shouldProcess(requestId: string, contentHash: string): ShouldProcessResult {
    const record = this.byRequestId.get(requestId);
    if (!record) return { process: false, reason: "missing" };
    if (record.status === "locked")
      return { process: false, reason: "locked", record: cloneRecord(record) };
    if (record.status === "aborted")
      return { process: false, reason: "aborted", record: cloneRecord(record) };
    if (record.pendingRetryDecision) {
      return { process: false, reason: "pending_retry", record: cloneRecord(record) };
    }
    const seenHashes = this.seenHashesByRequestId.get(requestId);
    if (seenHashes?.has(contentHash)) {
      return { process: false, reason: "duplicate_hash", record: cloneRecord(record) };
    }

    return { process: true, record: cloneRecord(record) };
  }

  recordInvalid(requestId: string, contentHash: string): RecordInvalidResult | null {
    const record = this.byRequestId.get(requestId);
    if (!record) return null;

    record.lastProcessedContentHash = contentHash;
    this.getSeenHashes(requestId).add(contentHash);
    record.failureCount += 1;
    const allowedFailures = this.allowedFailuresFor(record);
    const exhaustionReached = record.failureCount === allowedFailures;

    if (exhaustionReached) {
      record.pendingRetryDecision = true;
    }

    this.persist();
    return {
      record: cloneRecord(record),
      allowedFailures,
      exhaustionReached,
    };
  }

  markReady(requestId: string, contentHash: string): RuntimeRequestRecord | null {
    const record = this.byRequestId.get(requestId);
    if (!record) return null;

    record.lastProcessedContentHash = contentHash;
    this.getSeenHashes(requestId).add(contentHash);
    record.status = "ready";
    this.persist();
    return cloneRecord(record);
  }

  lockRequest(requestId: string): RuntimeRequestRecord | null {
    const record = this.byRequestId.get(requestId);
    if (!record || record.status !== "ready") return null;

    record.status = "locked";
    this.persist();
    return cloneRecord(record);
  }

  grantRetryBlock(requestId: string): RuntimeRequestRecord | null {
    const record = this.byRequestId.get(requestId);
    if (!record || !record.pendingRetryDecision) return null;

    record.extraRetryBlocksGranted += 1;
    record.pendingRetryDecision = false;
    this.persist();
    return cloneRecord(record);
  }

  abortRequest(requestId: string): RuntimeRequestRecord | null {
    const record = this.byRequestId.get(requestId);
    if (!record) return null;

    record.status = "aborted";
    record.pendingRetryDecision = false;
    this.persist();
    return cloneRecord(record);
  }

  allowedFailures(requestId: string): number {
    const record = this.byRequestId.get(requestId);
    if (!record) return RETRY_BLOCK_SIZE;
    return this.allowedFailuresFor(record);
  }

  private allowedFailuresFor(record: RuntimeRequestRecord): number {
    return RETRY_BLOCK_SIZE * (1 + record.extraRetryBlocksGranted);
  }

  private getSeenHashes(requestId: string): Set<string> {
    let seenHashes = this.seenHashesByRequestId.get(requestId);
    if (!seenHashes) {
      seenHashes = new Set<string>();
      this.seenHashesByRequestId.set(requestId, seenHashes);
    }
    return seenHashes;
  }

  private persist(): void {
    const snapshot = this.getSnapshot();
    this.pi.appendEntry(QUESTION_RUNTIME_STATE_ENTRY, snapshot);
  }
}
