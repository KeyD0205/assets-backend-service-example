import { describe, expect, it } from 'vitest';
import { assertNoProtectedAssetFields } from '../../src/modules/assets/asset.validation.js';

describe('assertNoProtectedAssetFields', () => {
  it('passes for a clean payload with custom extension fields', () => {
    expect(() =>
      assertNoProtectedAssetFields({ manufacturer: 'ACME', firmware_version: '1.2' })
    ).not.toThrow();
  });

  it('rejects the protected top-level field "id"', () => {
    expect(() => assertNoProtectedAssetFields({ id: '123' })).toThrow();
  });

  it('rejects the protected top-level field "tenant_id"', () => {
    expect(() => assertNoProtectedAssetFields({ tenant_id: 'abc' })).toThrow();
  });

  it('rejects the protected top-level field "created_at"', () => {
    expect(() => assertNoProtectedAssetFields({ created_at: '2024-01-01' })).toThrow();
  });

  it('rejects the protected top-level field "updated_at"', () => {
    expect(() => assertNoProtectedAssetFields({ updated_at: '2024-01-01' })).toThrow();
  });

  it('rejects a top-level MongoDB $ operator key', () => {
    expect(() => assertNoProtectedAssetFields({ $where: '1==1' })).toThrow();
  });

  it('rejects a nested $ operator key', () => {
    expect(() => assertNoProtectedAssetFields({ metadata: { '$gt': 0 } })).toThrow();
  });

  it('rejects a deeply nested $ operator key', () => {
    expect(() =>
      assertNoProtectedAssetFields({ a: { b: { c: { '$exists': true } } } })
    ).toThrow();
  });

  it('rejects a top-level dotted key', () => {
    expect(() => assertNoProtectedAssetFields({ 'profile.name': 'bad' })).toThrow();
  });

  it('rejects a dotted key nested inside an object', () => {
    expect(() =>
      assertNoProtectedAssetFields({ metadata: { 'foo.bar': 'bad' } })
    ).toThrow();
  });

  it('passes for an empty payload', () => {
    expect(() => assertNoProtectedAssetFields({})).not.toThrow();
  });

  it('passes for arrays as values (non-object leaf types are ignored)', () => {
    expect(() =>
      assertNoProtectedAssetFields({ tags: ['ok', 'safe'] })
    ).not.toThrow();
  });
});
