/**
 * Zero-dependency HTTP fetch utility with timeout and safe fallback
 */

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  text: string;
  url: string;
  ok: boolean;
}

export async function safeFetch(
  url: string,
  options: {
    timeoutMs?: number;
    userAgent?: string;
    headers?: Record<string, string>;
    method?: string;
  } = {}
): Promise<HttpResponse> {
  const timeoutMs = options.timeoutMs ?? 10000;
  const userAgent = options.userAgent ?? 'AgenticUCPScanner/1.0 (+https://nymrel.com; contact@jalenbuilds.com)';

  const headers: Record<string, string> = {
    'User-Agent': userAgent,
    Accept: 'text/html,application/xhtml+xml,application/json,text/plain,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    ...options.headers,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      signal: controller.signal,
      redirect: 'follow',
    });

    const text = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key.toLowerCase()] = value;
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      text,
      url: response.url || url,
      ok: response.ok,
    };
  } finally {
    clearTimeout(timer);
  }
}
