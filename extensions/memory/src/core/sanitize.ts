const ANSI_RE = new RegExp(String.raw`\u001b\[[0-9;]*[A-Za-z]`, "g");
const CTRL_RE = new RegExp(String.raw`[\u0000-\u0008\u000B\u000C\u000E-\u001F]`, "g");

export function sanitizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(ANSI_RE, "")
    .replace(CTRL_RE, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
