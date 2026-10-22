export type RunStatus =
  | "running"
  | "succeeded"
  | "failed"
  | "rolled-back"
  | "interrupted";

export type StepName = "fetch" | "checkout" | "build" | "swap" | "health";

export type StepStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped";

export interface Step {
  name: StepName;
  status: StepStatus;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface Run {
  id: string;
  sha: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  steps: Step[];
  error: string | null;
}

export interface CurrentDeploy {
  sha: string;
  subject: string;
  image: string;
  health: "healthy" | "unhealthy" | "starting" | "unknown";
  deployedAt: string;
}

export interface Status {
  current: CurrentDeploy | null;
  running: Run | null;
  runs: Run[];
}

export interface LogLine {
  line: string;
  at: string;
}

export const STEP_NAMES: StepName[] = [
  "fetch",
  "checkout",
  "build",
  "swap",
  "health",
];
