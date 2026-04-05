export const MEMORY_SYSTEM = "crumbs-memory";
export const MEMORY_DETAILS_VERSION = 1;
export const DEFAULT_MAX_SUMMARY_CHARS = 10_000;
export const DEFAULT_SEARCH_RESULT_LIMIT = 8;
export const DEFAULT_RECENT_HISTORY_COUNT = 8;

export const SUMMARY_SECTION_LIMITS = {
  goal: 3,
  recentTurns: 8,
  actions: 20,
  evidence: 15,
  filesPerBucket: 25,
  outstandingContext: 5,
  preferences: 10,
} as const;

export const BRANCH_SECTION_LIMITS = {
  goal: 3,
  recentTurns: 5,
  actions: 12,
  evidence: 8,
  filesPerBucket: 16,
  outstandingContext: 5,
  preferences: 8,
} as const;

export const STORED_STATE_LIMITS = {
  goal: 3,
  recentTurns: 8,
  actions: 60,
  evidence: 40,
  files: 100,
  outstandingContext: 5,
  preferences: 25,
} as const;
