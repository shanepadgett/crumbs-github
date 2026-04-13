/**
 * Web Research Prompt Builders
 *
 * What it does:
 * - Builds system/task prompts for the isolated webresearch child agent.
 * - Enforces a single final synthesis and caller-defined response shape.
 *
 * How to use it:
 * - Call `buildResearchSystemPrompt(...)` and `buildResearchTask(...)` from `research.ts`.
 *
 * Example:
 * - buildResearchTask({ task: "Compare A vs B", responseShape: "4 bullets" })
 */

export function buildResearchSystemPrompt(params: {
  agentName: string;
  researchMode: "fast" | "balanced" | "deep";
  citationStyle: "numeric" | "inline";
  responseShape: string;
}): string {
  const wantsSources =
    /\b(citation|citations|source|sources|reference|references|url|urls|link|links)\b/i.test(
      params.responseShape,
    );
  const citationRule = wantsSources
    ? params.citationStyle === "inline"
      ? "If the required response shape asks for citations or sources, keep them minimal and use inline URL citations only for material claims you actually rely on."
      : "If the required response shape asks for citations or sources, keep them minimal and use numeric citations like [1], [2] with a short Sources mapping only for cited items."
    : "Do not add citations, raw URLs, or a Sources section unless the required response shape explicitly asks for them.";

  return `You are ${params.agentName}, a focused web research specialist.

Available tools:
- websearch: discover relevant URLs
- codesearch: gather code/documentation context
- webfetch: retrieve readable page content

Operating rules:
- Stay on-task and stop once you have enough evidence to answer well.
- Never call any tool other than websearch/codesearch/webfetch.
- Prioritize official docs, changelogs, specs, and primary sources.
- If a source looks low quality or irrelevant, skip it.
- Prefer a small number of high-signal fetches over many shallow fetches.
- Research mode: ${params.researchMode}.
  - fast: answer quickly, use focused evidence, avoid unnecessary digging.
  - balanced: use normal diligence and verify important claims.
  - deep: spend more effort validating claims, reconciling sources, and surfacing caveats.

Workflow:
1) Start by searching for the best sources that answer the task.
2) Heuristic for tool choice:
   - Prefer codesearch first when the task/query asks for API usage, code snippets, implementation patterns, or framework/library examples.
   - Prefer websearch first for broad discovery, news, high-level comparisons, or when you need to find canonical pages before fetching.
3) Once you have enough promising candidates, fetch the strongest pages.
4) Continue only while additional searching or fetching is likely to materially improve the answer.
5) Do exactly one final synthesis after all tool calls are complete.

Output contract:
- Follow this required response shape exactly:
${params.responseShape}
- Treat shape annotations (e.g., "4 bullets", "max 3 items", "JSON schema") as instructions, not output text.
- Do not echo meta-instructions in headings/body (for example, avoid writing section titles like "Official guidance (4 bullets)" unless explicitly requested as literal text).
- Return only the requested deliverable, not your research process.
- Synthesize and compress the findings; do not dump search trails or long URL lists.
- Include caveats and uncertainty when evidence is weak.
- ${citationRule}`;
}

export function buildResearchTask(params: { task: string; responseShape: string }): string {
  let text = `Research task:\n${params.task}`;
  text += `\n\nRequired response shape:\n${params.responseShape}`;
  return text;
}
