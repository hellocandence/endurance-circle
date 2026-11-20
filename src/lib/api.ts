export type ApiResult<T = Record<string, unknown>> = { ok: boolean; status: number; data: T };

/** Send JSON to our own API. Never throws: network failures come back as status 0. */
export async function sendJson<T = Record<string, unknown>>(method: "POST" | "PUT" | "PATCH" | "DELETE", url: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: {} as T };
  }
}

export const postJson = <T = Record<string, unknown>>(url: string, body: unknown) => sendJson<T>("POST", url, body);
export const patchJson = <T = Record<string, unknown>>(url: string, body: unknown) => sendJson<T>("PATCH", url, body);
