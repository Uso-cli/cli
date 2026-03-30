import type {
  ExecutionPlan,
  IntentKind,
  IntentRequest,
  RuntimeRoute,
} from "../types";

// Intent aliases map for flexibility
const INTENT_ALIASES: Record<string, IntentKind> = {
  // check-environment aliases
  "check-environment": "check-environment",
  "check env": "check-environment",
  doctor: "check-environment",
  health: "check-environment",
  "verify environment": "check-environment",
  status: "check-environment",
  diagnose: "check-environment",

  // build-program aliases
  build: "build-program",
  "build-program": "build-program",
  compile: "build-program",
  "cargo build": "build-program",
  "anchor build": "build-program",

  // test-program aliases
  test: "test-program",
  "test-program": "test-program",
  "run tests": "test-program",
  "run test": "test-program",

  // deploy-program aliases
  deploy: "deploy-program",
  "deploy-program": "deploy-program",
  ship: "deploy-program",
  push: "deploy-program",
  launch: "deploy-program",
};

function inferKind(intent: string): IntentKind | null {
  const normalized = intent.toLowerCase().trim();

  // Direct alias lookup
  if (INTENT_ALIASES[normalized]) {
    return INTENT_ALIASES[normalized];
  }

  // Fuzzy matching: check if intent contains keywords
  if (
    normalized.includes("check") ||
    normalized.includes("doctor") ||
    normalized.includes("verify environment") ||
    normalized.includes("diagnose")
  ) {
    return "check-environment";
  }

  if (normalized.includes("build") || normalized.includes("compile")) {
    return "build-program";
  }

  if (normalized.includes("test") || normalized.includes("run test")) {
    return "test-program";
  }

  if (
    normalized.includes("deploy") ||
    normalized.includes("ship") ||
    normalized.includes("launch")
  ) {
    return "deploy-program";
  }

  return null;
}

function routeFromHint(
  routeHint: IntentRequest["routeHint"],
  fallback: RuntimeRoute,
): RuntimeRoute {
  if (routeHint === "native" || routeHint === "wsl") return routeHint;
  return fallback;
}

function resolveTaskCommand(
  intentKind: IntentKind,
  request: IntentRequest,
): { command: string; args: string[] } {
  const context = request.context ?? {};
  const requestedBinary =
    typeof context.binary === "string" ? context.binary : undefined;
  const requestedArgs = Array.isArray(context.args)
    ? context.args.filter((a): a is string => typeof a === "string")
    : [];

  if (requestedBinary) {
    const subCommand =
      intentKind === "build-program"
        ? "build"
        : intentKind === "test-program"
          ? "test"
          : intentKind === "deploy-program"
            ? "deploy"
            : "--version";
    return {
      command: requestedBinary,
      args:
        subCommand === "--version"
          ? ["--version"]
          : [subCommand, ...requestedArgs],
    };
  }

  const argMap: Record<IntentKind, { command: string; args: string[] }> = {
    "check-environment": { command: "node", args: ["--version"] },
    "build-program": { command: "anchor", args: ["build"] },
    "test-program": { command: "anchor", args: ["test"] },
    "deploy-program": { command: "anchor", args: ["deploy"] },
  };

  const baseCmd = argMap[intentKind];
  return {
    command: baseCmd.command,
    args: [...baseCmd.args, ...requestedArgs],
  };
}

export function routeIntent(
  request: IntentRequest,
  fallbackRoute: RuntimeRoute,
): ExecutionPlan {
  const intentKind = inferKind(request.intent);
  if (!intentKind) {
    throw new Error(
      `Unknown intent: "${request.intent}". Supported intents: check-environment, build-program, test-program, deploy-program`,
    );
  }

  const route = routeFromHint(request.routeHint, fallbackRoute);
  const task = resolveTaskCommand(intentKind, request);

  const preconditions: string[] = [];
  if (intentKind === "deploy-program") {
    preconditions.push("wallet-funded", "cluster-selected");
  }

  return {
    intentKind,
    route,
    preconditions,
    tasks: [
      {
        id: `${intentKind}-1`,
        command: task.command,
        args: task.args,
        requiresSimulation: intentKind !== "check-environment",
      },
    ],
  };
}
