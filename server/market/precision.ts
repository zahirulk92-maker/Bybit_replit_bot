import type { InstrumentMetadata } from '../types/domain';

function decimalPlaces(step: number): number {
  const text = step.toString().toLowerCase();
  if (text.includes('e-')) return Number(text.split('e-')[1]);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
}

function normalize(value: number, step: number): number {
  return Number(value.toFixed(Math.min(12, decimalPlaces(step))));
}

export function roundDown(value: number, step: number): number {
  if (!Number.isFinite(value) || value < 0 || step <= 0) return 0;
  return normalize(Math.floor((value + step * 1e-9) / step) * step, step);
}

export function roundUp(value: number, step: number): number {
  if (!Number.isFinite(value) || value < 0 || step <= 0) return 0;
  return normalize(Math.ceil((value - step * 1e-9) / step) * step, step);
}

export function roundNearest(value: number, step: number): number {
  if (!Number.isFinite(value) || value < 0 || step <= 0) return 0;
  return normalize(Math.round(value / step) * step, step);
}

export function roundPrice(
  metadata: InstrumentMetadata,
  value: number,
  direction: 'DOWN' | 'UP' | 'NEAREST' = 'NEAREST',
): number {
  if (direction === 'DOWN') return roundDown(value, metadata.tickSize);
  if (direction === 'UP') return roundUp(value, metadata.tickSize);
  return roundNearest(value, metadata.tickSize);
}

export function roundQuantity(metadata: InstrumentMetadata, value: number): number {
  const rounded = roundDown(value, metadata.quantityStep);
  if (metadata.maximumQuantity && rounded > metadata.maximumQuantity) {
    return roundDown(metadata.maximumQuantity, metadata.quantityStep);
  }
  return rounded;
}


export function minimumExecutableQuantity(
  metadata: InstrumentMetadata,
  price: number,
): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  const notionalQuantity = metadata.minimumNotional / price;
  const required = Math.max(metadata.minimumQuantity, notionalQuantity);
  const rounded = roundUp(required, metadata.quantityStep);
  if (metadata.maximumQuantity && rounded > metadata.maximumQuantity) return 0;
  return rounded;
}

export function isMinimumOrderValid(
  metadata: InstrumentMetadata,
  quantity: number,
  price: number,
): { ok: boolean; reason?: string; notional: number } {
  const notional = quantity * price;
  if (quantity < metadata.minimumQuantity) {
    return { ok: false, reason: `Quantity below minimum ${metadata.minimumQuantity}`, notional };
  }
  if (notional < metadata.minimumNotional) {
    return { ok: false, reason: `Notional below minimum ${metadata.minimumNotional}`, notional };
  }
  return { ok: true, notional };
}

export function approximatelyEqual(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance + Number.EPSILON;
}
