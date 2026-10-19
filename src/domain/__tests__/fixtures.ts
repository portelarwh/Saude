import type { BodyAssessment, Food } from '../types';

export function makeFood(overrides: Partial<Food> = {}): Food {
  return {
    id: 'user:test',
    user_id: 'u1',
    name: 'Alimento teste',
    aliases: [],
    brand: null,
    flavor: null,
    variant: null,
    category: null,
    preparation_state: null,
    base_unit: 'g',
    serving_size: null,
    serving_label: null,
    household_measures: [],
    per100: {},
    trace_nutrients: [],
    source: 'manual',
    source_ref: null,
    verification: 'reported',
    verified_at: null,
    label_basis: null,
    barcode: null,
    ingredients_text: null,
    is_supplement: false,
    supplement_category: null,
    compounds_per_serving: null,
    ...overrides,
  };
}

export function makeAssessment(overrides: Partial<BodyAssessment>): BodyAssessment {
  return {
    id: Math.random().toString(36).slice(2),
    user_id: 'u1',
    created_at: new Date().toISOString(),
    measured_at: '2026-01-01T08:00:00.000Z',
    device_manufacturer: 'InBody',
    device_model: 'InBody 270',
    method: 'bioimpedance',
    input: 'manual',
    metrics: {},
    visceral_fat_scale: null,
    segmental: [],
    other_metrics: [],
    conditions: null,
    file_path: null,
    extraction_raw: null,
    notes: null,
    ...overrides,
  };
}
