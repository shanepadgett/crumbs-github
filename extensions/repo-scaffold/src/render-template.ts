export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replaceAll(/{{\s*([a-zA-Z0-9_-]+)\s*}}/g, (match, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`Unknown template variable: ${name}`);
    return value;
  });
}
