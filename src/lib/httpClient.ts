import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { getSupabaseAuthHeadersForUrl, supabaseFetch } from '@/config/supabaseConfig';

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

export type HttpJsonResponse = {
  status: number;
  data: any;
  rawText?: string;
};

const MAX_PREVIEW = 120;

function parseMaybeJson(value: unknown): any {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export function isNativePlatform(): boolean {
  return Capacitor?.isNativePlatform?.() === true;
}

async function nativeRequest(method: 'GET' | 'POST', url: string, body?: any, headers?: Record<string, string>): Promise<HttpJsonResponse> {
  const endpoint = String(url || '').trim();
  if (!CapacitorHttp?.request) {
    throw new HttpClientError(0, endpoint, 'CapacitorHttp unavailable');
  }
  const authHeaders = getSupabaseAuthHeadersForUrl(endpoint);
  try {
    const response = await CapacitorHttp.request({
      method,
      url: endpoint,
      headers: {
        ...(method === 'POST' ? { 'Content-Type': 'text/plain;charset=UTF-8' } : {}),
        ...(headers || {}),
        ...authHeaders,
      },
      data: method === 'POST' ? JSON.stringify(body || {}) : undefined,
    });
    const parsed = parseMaybeJson(response?.data);
    const rawText = typeof response?.data === 'string' ? response.data.slice(0, MAX_PREVIEW) : undefined;
    return {
      status: Number(response?.status || 0),
      data: parsed,
      rawText,
    };
  } catch (error: any) {
    throw new HttpClientError(0, endpoint, error?.message || 'Failed to fetch');
  }
}

async function webRequest(method: 'GET' | 'POST', url: string, body?: any, headers?: Record<string, string>): Promise<HttpJsonResponse> {
  const endpoint = String(url || '').trim();
  let response: Response;
  try {
    response = await supabaseFetch(endpoint, {
      method,
      headers: {
        ...(method === 'POST' ? { 'content-type': 'text/plain;charset=UTF-8' } : {}),
        ...(headers || {}),
      },
      body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
    });
  } catch (error: any) {
    throw new HttpClientError(0, endpoint, error?.message || 'Failed to fetch');
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const data = await response.json();
    return { status: response.status, data };
  }
  const text = await response.text();
  return {
    status: response.status,
    data: text,
    rawText: text.slice(0, MAX_PREVIEW),
  };
}

export async function getJson(url: string, headers?: Record<string, string>): Promise<HttpJsonResponse> {
  if (isNativePlatform()) return nativeRequest('GET', url, undefined, headers);
  return webRequest('GET', url, undefined, headers);
}

export async function postJson(url: string, body: any, headers?: Record<string, string>): Promise<HttpJsonResponse> {
  if (isNativePlatform()) return nativeRequest('POST', url, body, headers);
  return webRequest('POST', url, body, headers);
}
