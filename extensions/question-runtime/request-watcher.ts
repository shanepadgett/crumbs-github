import { watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, join, normalize } from "node:path";
import { validateAuthorizedQuestionRequest } from "./request-validator.js";
import { normalizeCanonicalAbsolutePath } from "./request-paths.js";

const WATCH_DEBOUNCE_MS = 120;

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export interface ValidatedRequestFileEvent {
  absolutePath: string;
  contentHash: string;
  text: string;
  validation: ReturnType<typeof validateAuthorizedQuestionRequest>;
}

export class QuestionRuntimeRequestWatcher {
  private watcher: FSWatcher | null = null;
  private knownPaths = new Set<string>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly requestDirectory: string,
    private readonly onValidated: (event: ValidatedRequestFileEvent) => void,
  ) {}

  setKnownPaths(paths: string[]): void {
    this.knownPaths = new Set(paths.map((path) => normalizeCanonicalAbsolutePath(path)));
  }

  start(): void {
    this.stop();

    this.watcher = watch(this.requestDirectory, (eventType, fileName) => {
      if (eventType !== "change" && eventType !== "rename") return;
      const name = typeof fileName === "string" ? fileName : "";

      if (name) {
        const absolutePath = normalize(join(this.requestDirectory, name));
        this.scheduleFile(absolutePath);
        return;
      }

      for (const absolutePath of this.knownPaths) {
        if (basename(absolutePath).endsWith(".json")) this.scheduleFile(absolutePath);
      }
    });
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  async rescanKnownFiles(): Promise<void> {
    for (const absolutePath of this.knownPaths) {
      await this.processPath(absolutePath);
    }
  }

  private scheduleFile(absolutePath: string): void {
    if (!this.knownPaths.has(absolutePath)) return;

    const existing = this.debounceTimers.get(absolutePath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(absolutePath);
      void this.processPath(absolutePath);
    }, WATCH_DEBOUNCE_MS);

    this.debounceTimers.set(absolutePath, timer);
  }

  private async processPath(absolutePath: string): Promise<void> {
    if (!this.knownPaths.has(absolutePath)) return;

    let text: string;
    try {
      text = await readFile(absolutePath, "utf8");
    } catch {
      return;
    }

    const contentHash = hashText(text);
    const validation = validateAuthorizedQuestionRequest(text);
    this.onValidated({ absolutePath, contentHash, text, validation });
  }
}
