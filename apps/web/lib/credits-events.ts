const CREDITS_REFRESH_EVENT = "cropcopilot:credits:refresh";

export function emitCreditsRefresh(reason = "manual"): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(CREDITS_REFRESH_EVENT, {
      detail: { reason, at: new Date().toISOString() },
    })
  );
}

export function onCreditsRefresh(listener: (reason: string) => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const wrapped = (event: Event) => {
    const customEvent = event as CustomEvent<{ reason?: string }>;
    listener(customEvent.detail?.reason ?? "manual");
  };

  window.addEventListener(CREDITS_REFRESH_EVENT, wrapped);
  return () => {
    window.removeEventListener(CREDITS_REFRESH_EVENT, wrapped);
  };
}
