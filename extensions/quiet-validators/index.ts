/**
 * Quiet Validators Extension
 *
 * What it does: runs background validators after relevant file changes and prevents duplicate manual checks.
 * How to use it: edit files normally; validator failures surface separately.
 * Example: save Markdown changes; markdownlint runs quietly in background.
 */

export { default } from "./src/extension.js";
