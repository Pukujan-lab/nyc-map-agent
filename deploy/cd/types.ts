/** Wire types shared by the deploy API and the dashboard. */

export type RunStatus = "running" | "succeeded" | "failed" | "rolled-back" | "interrupted";
export type StepName = "fetch" | "checkout" | "build" | "swap" | "health";
export type StepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";
export type DeployKind = "deploy" | "rollback";

export interface Step {
  name: StepName;
  status: StepStatus;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface Run {
  id: string;
  sha: string;
  kind: DeployKind;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  image: string;
  previousImage: string | null;
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

export const STEP_ORDER: StepName[] = ["fetch", "checkout", "build", "swap", "health"];

export function emptySteps(): Step[] {
  return STEP_ORDER.map((name) => ({ name, status: "pending", startedAt: null, finishedAt: null }));
}
