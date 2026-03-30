export interface McpRegistrationHook {
  register(): Promise<void>;
}

export async function registerMcpHook(
  hook?: McpRegistrationHook,
): Promise<void> {
  if (!hook) return;
  await hook.register();
}
