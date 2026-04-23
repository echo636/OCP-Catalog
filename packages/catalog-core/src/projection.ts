import { isRecord } from './field-ref';

export function visibleAttributes(projection: Record<string, unknown>) {
  // Scenario-neutral convention: projection keys starting with `__` are kept
  // in the stored projection so Resolve-time action builders can read them,
  // but are stripped from the visible_attributes returned to callers. This
  // lets a scenario carry Resolve-only payload (e.g. channel contact info)
  // without leaking through search results.
  const hidden = new Set(['text']);
  return Object.fromEntries(
    Object.entries(projection).filter(([key]) => !hidden.has(key) && !key.startsWith('__')),
  );
}

export function stringField(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function numberField(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function asProjection(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
