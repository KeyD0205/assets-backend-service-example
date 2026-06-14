import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { inputSanitization } from '../../src/middleware/inputSanitization.js';

function makeReq(body: unknown = {}, query: unknown = {}): Request {
  return { body, query } as unknown as Request;
}

function run(req: Request): { err?: unknown } {
  let capturedErr: unknown;
  const next: NextFunction = (err?: unknown) => { capturedErr = err; };
  inputSanitization(req, {} as Response, next);
  return { err: capturedErr };
}

describe('inputSanitization middleware', () => {
  it('passes through a clean body unchanged', () => {
    const req = makeReq({ name: 'pump', type: 'valve' });
    const { err } = run(req);
    expect(err).toBeUndefined();
    expect(req.body).toEqual({ name: 'pump', type: 'valve' });
  });

  it('passes through a null body without error', () => {
    const req = makeReq(null);
    const { err } = run(req);
    expect(err).toBeUndefined();
  });

  it('passes through arrays of clean objects', () => {
    const req = makeReq([{ name: 'ok' }, { name: 'also-ok' }]);
    const { err } = run(req);
    expect(err).toBeUndefined();
  });

  it('rejects a top-level $ key in body', () => {
    const req = makeReq({ '$where': '1==1' });
    const { err } = run(req);
    expect(err).toBeDefined();
  });

  it('rejects __proto__ in body', () => {
    const req = makeReq({ '__proto__': { isAdmin: true } });
    const { err } = run(req);
    expect(err).toBeDefined();
  });

  it('rejects "constructor" in body', () => {
    const req = makeReq({ 'constructor': { prototype: {} } });
    const { err } = run(req);
    expect(err).toBeDefined();
  });

  it('rejects "prototype" in body', () => {
    const req = makeReq({ 'prototype': {} });
    const { err } = run(req);
    expect(err).toBeDefined();
  });

  it('rejects a nested $ key', () => {
    const req = makeReq({ metadata: { '$gt': 0 } });
    const { err } = run(req);
    expect(err).toBeDefined();
  });

  it('rejects a $ key inside an array element', () => {
    const req = makeReq([{ '$where': 'bad' }]);
    const { err } = run(req);
    expect(err).toBeDefined();
  });

  it('rejects a $ key in query params', () => {
    const req = makeReq({}, { '$where': 'bad' });
    const { err } = run(req);
    expect(err).toBeDefined();
  });
});
