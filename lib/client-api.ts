import { readErrorMessage } from "@/lib/errors";

export async function apiFetch<T extends { error?: string; detail?: string }>(
  input: string,
  init?: RequestInit,
): Promise<{ res: Response; data: T }> {
  const res = await fetch(input, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data = (await res.json()) as T;
  return { res, data };
}

export async function apiFetchOk<T extends { error?: string; detail?: string }>(
  input: string,
  fallback: string,
  init?: RequestInit,
): Promise<T> {
  const { res, data } = await apiFetch<T>(input, init);
  if (!res.ok) throw new Error(readErrorMessage(data, fallback));
  return data;
}
