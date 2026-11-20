export type ApiResult<T = Record<string, unknown>> = { ok: boolean; status: number; data: T };

/** POST JSON to our own API. Never throws: network failures come back as status 0. */
export async function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: {} as T };
  }
}
