export function redactSensitiveText(text: string): string {
  return text
    .replace(/(Bearer\s+)([A-Za-z0-9._-]+)/gi, "$1[REDACTED]")
    .replace(
      /(api[_-]?key|token|password|secret|client[_-]?secret)\s*[:=]\s*(["']?)([^\s"',;]+)/gi,
      (_match, label: string, quote: string) => `${label}=${quote}[REDACTED]`,
    )
    .replace(
      /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g,
      "[REDACTED PRIVATE KEY]",
    )
    .replace(/(--identity|-i)\s+\S+/g, "$1 [REDACTED_PATH]");
}
