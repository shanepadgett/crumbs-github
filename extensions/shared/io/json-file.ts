import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type JsonObject = Record<string, unknown>;

export function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

export async function readJsonObject(path: string): Promise<JsonObject> {
  try {
    const raw = await readFile(path, "utf8");
    return asObject(JSON.parse(raw)) ?? {};
  } catch {
    return {};
  }
}

export async function writeJsonObject(path: string, value: JsonObject): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
