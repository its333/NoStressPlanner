const DEBUG_FLAG =
  process.env.NEXT_PUBLIC_ENABLE_DEBUG_LOGS === 'true' ||
  process.env.ENABLE_DEBUG_LOGS === 'true';

export function debugLog(message: string, ...optionalParams: unknown[]): void {
  if (!DEBUG_FLAG) {
    return;
  }

  if (optionalParams.length > 0) {
    console.debug(message, ...optionalParams);
  } else {
    console.debug(message);
  }
}
