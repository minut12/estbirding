// src/components/FeatureVersionBadge.tsx
// P109: muted per-feature version shown after a tab title (data: src/lib/featureVersions.ts).
import { featureVersionById, type FeatureId } from '@/lib/featureVersions';

interface FeatureVersionBadgeProps {
  id: FeatureId;
}

export function FeatureVersionBadge({ id }: FeatureVersionBadgeProps) {
  const version = featureVersionById(id);
  if (!version) return null;
  return (
    <span className="ml-2 align-middle font-mono text-[11px] font-semibold text-muted-foreground" title="Versioon">
      v{version}
    </span>
  );
}
