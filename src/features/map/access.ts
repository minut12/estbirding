import type { AppRole } from '@/features/auth/AuthContext';
import type { MapDefinition } from './config';

type MapAccessInput = {
  role: AppRole | null;
  permissions: string[];
  maps: MapDefinition[];
  requestedId?: string | null;
};

function logAllowedMaps(role: AppRole | null, allowed: MapDefinition[]) {
  console.log(`[map-access] role=${role ?? 'unknown'} allowed=${allowed.map((map) => map.id).join(',') || 'none'}`);
  console.log(`[map-access] selectorOptions=${allowed.map((map) => map.id).join(',') || 'none'}`);
}

export function getAllowedMapsForRole(
  role: AppRole | null,
  permissions: string[],
  maps: MapDefinition[],
): MapDefinition[] {
  const enabledMaps = maps.filter((map) => map.enabled);

  if (role === 'admin') {
    logAllowedMaps(role, enabledMaps);
    return enabledMaps;
  }

  if (role === 'user_level_1') {
    const allowed = enabledMaps.filter((map) => map.id === 'rariliin');
    logAllowedMaps(role, allowed);
    return allowed;
  }

  const allowed = enabledMaps.filter((map) => permissions.includes(map.permissionKey));
  logAllowedMaps(role, allowed);
  return allowed;
}

export function resolveAllowedMapSelection({
  role,
  permissions,
  maps,
  requestedId,
}: MapAccessInput): MapDefinition | null {
  const allowedMaps = getAllowedMapsForRole(role, permissions, maps);
  if (!allowedMaps.length) return null;

  const requested = (requestedId || '').trim();
  const selected = requested
    ? allowedMaps.find((map) => map.id === requested)
    : null;

  if (selected) return selected;

  if (requested) {
    console.log(`[map-access] restoredMap=${requested} rejected`);
  }

  const fallback = role === 'user_level_1'
    ? allowedMaps.find((map) => map.id === 'rariliin') ?? allowedMaps[0]
    : allowedMaps[0];

  console.log(`[map-access] fallbackMap=${fallback.id}`);
  return fallback;
}
