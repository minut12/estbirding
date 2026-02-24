import { Capacitor, CapacitorHttp } from '@capacitor/core';

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

const MAX_PREVIEW = 200;

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

async function nativeRequest(method: 'GET' | 'POST', url: string, body?: any): Promise<HttpJsonResponse> {
  const endpoint = String(url || '').trim();
  if (!CapacitorHttp?.request) {
    throw new HttpClientError(0, endpoint, 'CapacitorHttp unavailable');
  }
  try {
    const response = await CapacitorHttp.request({
      method,
      url: endpoint,
      headers: { 'Content-Type': 'application/json' },
      data: method === 'POST' ? body : undefined,
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

async function webRequest(method: 'GET' | 'POST', url: string, body?: any): Promise<HttpJsonResponse> {
  const endpoint = String(url || '').trim();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method,
      headers: { 'content-type': 'application/json' },
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

export async function getJson(url: string): Promise<HttpJsonResponse> {
  if (isNativePlatform()) return nativeRequest('GET', url);
  return webRequest('GET', url);
}

export async function postJson(url: string, body: any): Promise<HttpJsonResponse> {
  if (isNativePlatform()) return nativeRequest('POST', url, body);
  return webRequest('POST', url, body);
}
