export class HttpClientError extends Error {
  status: number;
  endpoint: string;

  constructor(status: number, endpoint: string, message: string) {
    super(message);
    this.status = status;
    this.endpoint = endpoint;
    this.name = 'HttpClientError';
  }
}

const MAX_ERROR_PREVIEW_CHARS = 200;

function normalizeBodyPreview(input: unknown): string {
  return String(input || '').slice(0, MAX_ERROR_PREVIEW_CHARS).replace(/\s+/g, ' ').trim();
}

function parseNativeData(data: unknown): unknown {
  if (typeof data !== 'string') return data;
  const trimmed = data.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function getNativeHttp() {
  const cap = (globalThis as any)?.Capacitor;
  const nativeHttp = (globalThis as any)?.CapacitorHttp || cap?.Plugins?.CapacitorHttp;
  const isNative = cap?.isNativePlatform?.() === true;
  return { isNative, nativeHttp };
}

async function requestJson(method: 'GET' | 'POST', url: string, data?: unknown): Promise<any> {
  const endpoint = String(url || '').trim();
  const { isNative, nativeHttp } = getNativeHttp();

  if (isNative && nativeHttp?.request) {
    let nativeResponse: any;
    try {
      nativeResponse = await nativeHttp.request({
        method,
        url: endpoint,
        headers: { 'Content-Type': 'application/json' },
        data,
      });
    } catch (error: any) {
      const message = error?.message || 'Failed to fetch';
      throw new HttpClientError(0, endpoint, `${message}. Endpoint=${endpoint}`);
    }

    const status = Number(nativeResponse?.status || 0);
    const parsed = parseNativeData(nativeResponse?.data);
    if (status < 200 || status >= 300) {
      const preview = normalizeBodyPreview(typeof parsed === 'string' ? parsed : JSON.stringify(parsed));
      throw new HttpClientError(status, endpoint, `HTTP ${status} ${preview || 'Request failed'}`);
    }
    if (typeof parsed === 'string') {
      throw new HttpClientError(status, endpoint, `HTTP ${status} Expected JSON, got text: ${normalizeBodyPreview(parsed)}`);
    }
    return parsed;
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(data || {}) : undefined,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to fetch';
    throw new HttpClientError(0, endpoint, `${message}. Endpoint=${endpoint}`);
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const isJson = contentType.includes('application/json');
  if (!isJson) {
    const raw = await response.text();
    const preview = normalizeBodyPreview(raw);
    throw new HttpClientError(response.status, endpoint, `HTTP ${response.status} Expected JSON, got ${contentType || 'unknown'}: ${preview || '[empty body]'}`);
  }

  const parsed = await response.json();
  if (!response.ok) {
    const preview = normalizeBodyPreview(typeof parsed === 'string' ? parsed : JSON.stringify(parsed));
    throw new HttpClientError(response.status, endpoint, `HTTP ${response.status} ${preview || 'Request failed'}`);
  }

  return parsed;
}

export async function httpGetJson(url: string): Promise<any> {
  return requestJson('GET', url);
}

export async function httpPostJson(url: string, data: any): Promise<any> {
  return requestJson('POST', url, data);
}

