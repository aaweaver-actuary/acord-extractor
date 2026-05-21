const DEBUG_PREFIX = "acord-debug";
const DEBUG_MESSAGE_LIMIT = 18;

let debugSequence = 0;
let debugMessagesEmitted = 0;
let debugTraceActive = false;
let debugLimitNoticeEmitted = false;
const debugEventCounts = new Map<string, number>();

interface DebugLogOptions {
  force?: boolean;
  maxOccurrences?: number;
}

function isDebugLoggingEnabled(): boolean {
  return import.meta.env.MODE !== "test";
}

function nextDebugLabel(scope: string, event: string): string {
  debugSequence += 1;
  return `[${DEBUG_PREFIX}:${debugSequence}] ${scope} ${event}`;
}

function resetDebugTraceState() {
  debugSequence = 0;
  debugMessagesEmitted = 0;
  debugLimitNoticeEmitted = false;
  debugEventCounts.clear();
}

function withTimestamp(
  payload?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    timestamp: new Date().toISOString(),
    ...(payload ?? {}),
  };
}

function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorMessage: error.message,
      errorName: error.name,
      errorStack: error.stack,
    };
  }

  return {
    errorValue: String(error),
  };
}

function emitLimitNotice() {
  if (debugLimitNoticeEmitted || !isDebugLoggingEnabled()) {
    return;
  }

  debugLimitNoticeEmitted = true;
  debugMessagesEmitted += 1;
  console.warn(
    `[${DEBUG_PREFIX}:limit] further messages suppressed`,
    withTimestamp({
      emittedMessages: debugMessagesEmitted - 1,
      messageLimit: DEBUG_MESSAGE_LIMIT,
    }),
  );
}

function shouldEmitDebugLog(
  scope: string,
  event: string,
  options?: DebugLogOptions,
): boolean {
  if (!isDebugLoggingEnabled()) {
    return false;
  }

  if (!debugTraceActive && !options?.force) {
    return false;
  }

  if (debugMessagesEmitted >= DEBUG_MESSAGE_LIMIT) {
    emitLimitNotice();
    return false;
  }

  if (options?.maxOccurrences === undefined) {
    return true;
  }

  const eventKey = `${scope}:${event}`;
  const eventCount = debugEventCounts.get(eventKey) ?? 0;

  if (eventCount >= options.maxOccurrences) {
    return false;
  }

  debugEventCounts.set(eventKey, eventCount + 1);
  return true;
}

function emitDebugMessage(
  method: "info" | "error",
  scope: string,
  event: string,
  payload?: Record<string, unknown>,
) {
  debugMessagesEmitted += 1;
  console[method](nextDebugLabel(scope, event), withTimestamp(payload));
}

export function startDebugTrace(
  scope: string,
  event: string,
  payload?: Record<string, unknown>,
) {
  if (!isDebugLoggingEnabled()) {
    return;
  }

  debugTraceActive = true;
  resetDebugTraceState();
  emitDebugMessage("info", scope, event, {
    ...(payload ?? {}),
    messageLimit: DEBUG_MESSAGE_LIMIT,
  });
}

export function debugLog(
  scope: string,
  event: string,
  payload?: Record<string, unknown>,
  options?: DebugLogOptions,
) {
  if (!shouldEmitDebugLog(scope, event, options)) {
    return;
  }

  emitDebugMessage("info", scope, event, payload);
}

export function debugError(
  scope: string,
  event: string,
  error: unknown,
  payload?: Record<string, unknown>,
  options?: DebugLogOptions,
) {
  if (!shouldEmitDebugLog(scope, event, { ...options, force: true })) {
    return;
  }

  emitDebugMessage("error", scope, event, {
    ...(payload ?? {}),
    ...describeError(error),
  });
}
