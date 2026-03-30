export interface EventLogger {
  emit(event: string, detail?: unknown): void;
  getEvents(): string[];
}

export function createEventLogger(): EventLogger {
  const events: string[] = [];

  return {
    emit(event, detail) {
      const payload = detail ? ` ${JSON.stringify(detail)}` : "";
      events.push(`${new Date().toISOString()} ${event}${payload}`);
    },
    getEvents() {
      return events;
    },
  };
}
