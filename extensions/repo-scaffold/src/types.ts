export type Scope = "ts" | "markdown" | "yaml" | "go" | "swift" | "xcode" | "agent-python";

export type VersionSource =
  | { kind: "mise"; tool: string }
  | { kind: "npm"; packageName: string }
  | { kind: "pypi"; packageName: string; requiresPython?: boolean }
  | { kind: "github"; repo: string };

export type ToolSpec = {
  id: string;
  label: string;
  miseKey?: string;
  miseValue?: (version: string, versions: Record<string, string>) => MiseToolValue;
  packageDevDependency?: string;
  source: VersionSource;
  maxVersionExclusive?: string;
  defaultVersion?: string;
};

export type MiseToolValue = string | { version: string; uvx_args?: string };

export type QuietValidatorConfig = {
  name: string;
  enabled?: boolean;
  task: string;
  trackedExtensions: string[];
  excludeGlobs?: string[];
};

export type ScaffoldFile = {
  path: string;
  content: string;
  executable?: boolean;
};

export type Profile = {
  id: Scope;
  label: string;
  description: string;
  defaultOn: boolean;
  tools: ToolSpec[];
  files: (versions: Record<string, string>, options: ScaffoldOptions) => ScaffoldFile[];
  quietValidators: QuietValidatorConfig[];
};

export type ScaffoldOptions = {
  primaryJsRuntime: "bun" | "node";
  jsQualityStack: "ox" | "biome";
};

export type ScaffoldPlan = {
  profiles: Profile[];
  versions: Record<string, string>;
  options: ScaffoldOptions;
  files: ScaffoldFile[];
  quietValidators: QuietValidatorConfig[];
  miseTools: Record<string, MiseToolValue>;
  packageDevDependencies: Record<string, string>;
};
