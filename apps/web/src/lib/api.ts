export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    let parsedMessage = "";
    try {
      const payload = JSON.parse(text) as { message?: string | string[]; error?: string; statusCode?: number };
      const message = Array.isArray(payload.message) ? payload.message.join(" ") : payload.message;
      parsedMessage = message || payload.error || (payload.statusCode ? `Request failed with status ${payload.statusCode}` : "");
    } catch {
      parsedMessage = "";
    }
    throw new Error(parsedMessage || text || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
