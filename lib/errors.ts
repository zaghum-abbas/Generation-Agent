export function readErrorMessage(
  data: { error?: string; detail?: string },
  fallback: string,
): string {
  if (data.detail && data.error) return `${data.error}: ${data.detail}`;
  return data.error ?? fallback;
}
