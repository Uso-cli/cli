export type RuntimeRoute = "native" | "wsl";
export type IntentKind =
  | "check-environment"
  | "build-program"
  | "test-program"
  | "deploy-program";

export interface GuardrailPolicy {
  maxSpendSol?: number;
  allowedClusters?: Array<"localnet" | "devnet" | "testnet" | "mainnet-beta">;
  allowedPrograms?: string[];
  requireSimulationPass?: boolean;
  blockOnUnknownIntent?: boolean;
  blockUnsafeHealActions?: boolean;
  allowAutoHealDeploy?: boolean;
}

export interface UsoConfig {
  projectRoot: string;
  telemetry?: {
    enabled: boolean;
    mode: "local";
    logDir?: string;
  };
  guardrails?: GuardrailPolicy;
  runtime?: {
    preferWsl?: boolean;
    distro?: string;
    shell?: "powershell" | "bash";
  };
  healing?: {
    enabled: boolean;
    maxAttempts: number;
    backoffMs: number;
  };
}

export interface InitOptions {
  strict?: boolean;
  registerMcpHook?: boolean;
}

export interface CheckResult {
  id: string;
  status: "pass" | "warn" | "fail";
  message: string;
  detail?: string;
  remediation?: string;
}

export interface InitResult {
  timestamp: string;
  os: "windows" | "linux" | "darwin";
  runtimeRoute: RuntimeRoute;
  checks: CheckResult[];
  warnings: string[];
  errors: string[];
}

export interface IntentRequest {
  id?: string;
  intent: string;
  context?: Record<string, unknown>;
  routeHint?: RuntimeRoute | "auto";
}

export interface ExecutionTask {
  id: string;
  command: string;
  args: string[];
  requiresSimulation: boolean;
}

export interface ExecutionPlan {
  intentKind: IntentKind;
  route: RuntimeRoute;
  tasks: ExecutionTask[];
  preconditions: string[];
}

export type ErrorCategory =
  | "ENV_MISSING_TOOL"
  | "ENV_ROUTE_UNAVAILABLE"
  | "CONFIG_INVALID"
  | "PRECONDITION_FAILED"
  | "SIMULATION_FAILED"
  | "EXECUTION_FAILED"
  | "POLICY_BLOCKED"
  | "UNKNOWN";

export interface UsoError {
  category: ErrorCategory;
  code: string;
  message: string;
  actionableHint?: string;
  raw?: string;
}

export interface AttemptRecord {
  taskId: string;
  attempt: number;
  command: string;
  route: RuntimeRoute;
  status: "success" | "failed" | "skipped";
  stdout: string;
  stderr: string;
  exitCode: number;
  appliedFix?: string;
}

export interface EvidenceBundle {
  events: string[];
  notes: string[];
  reflections: ReflectionRecord[];
}

export interface ExecutionResult {
  intentId: string;
  status: "success" | "failed" | "blocked";
  route: RuntimeRoute;
  plan: ExecutionPlan;
  attempts: AttemptRecord[];
  evidence: EvidenceBundle;
  error?: UsoError;
}

export interface ToolVersion {
  name: string;
  available: boolean;
  version?: string;
  raw?: string;
}

export interface RuntimeDiscovery {
  os: "windows" | "linux" | "darwin";
  route: RuntimeRoute;
  shell: "powershell" | "bash";
  wslAvailable: boolean;
}

export interface SimulationResult {
  ok: boolean;
  reason?: string;
}

export interface HealingDecision {
  level: HealingLevel;
  decision: "retry" | "stop" | "escalate";
  shouldRetry: boolean;
  appliedFix?: string;
  reason?: string;
  retryAfterMs?: number;
}

export type HealingLevel = "heuristic" | "contextual" | "escalation";

export interface ReflectionRecord {
  timestamp: string;
  taskId: string;
  attempt: number;
  level: HealingLevel;
  decision: "retry" | "stop" | "escalate";
  reason: string;
  stderrSnippet?: string;
  appliedFix?: string;
}
