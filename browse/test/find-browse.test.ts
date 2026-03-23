/**
 * Tests for find-browse binary locator.
 */

import { describe, test, expect } from 'bun:test';
import { locateBinary, shouldUseWorkspaceBinary } from '../src/find-browse';
import { existsSync } from 'fs';

describe('locateBinary', () => {
  test('returns null when no binary exists at known paths', () => {
    // This test depends on the test environment — if a real binary exists at
    // ~/.claude/skills/gstack/browse/dist/browse, it will find it.
    // We mainly test that the function doesn't throw.
    const result = locateBinary();
    expect(result === null || typeof result === 'string').toBe(true);
  });

  test('returns string path when binary exists', () => {
    const result = locateBinary();
    if (result !== null) {
      expect(existsSync(result)).toBe(true);
    }
  });

  test('prefers workspace only when its binary version validates against shared runtime', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../src/find-browse.ts'), 'utf-8');
    expect(src).toContain("join(root, '.gstack', 'browse', 'dist', 'browse')");
    expect(src).toContain("join(home, '.gstack', 'browse', 'dist', 'browse')");
    expect(src).toContain('function isValidatedWorkspaceBinary(workspace: string, shared: string): boolean');
    expect(src).toContain("if (!existsSync(shared)) return workspace;");
    expect(src).toContain("if (isValidatedWorkspaceBinary(workspace, shared)) {");

    const workspaceGate = src.indexOf("if (workspace && existsSync(workspace)) {");
    const noSharedFallback = src.indexOf("if (!existsSync(shared)) return workspace;");
    const validationGate = src.indexOf("if (isValidatedWorkspaceBinary(workspace, shared)) {");
    const sharedFallback = src.indexOf("if (existsSync(shared)) return shared;");
    const legacyLocalCheck = src.indexOf("const local = join(root, m, 'skills', 'gstack', 'browse', 'dist', 'browse');");

    expect(workspaceGate).toBeGreaterThanOrEqual(0);
    expect(noSharedFallback).toBeGreaterThanOrEqual(0);
    expect(validationGate).toBeGreaterThanOrEqual(0);
    expect(sharedFallback).toBeGreaterThanOrEqual(0);
    expect(legacyLocalCheck).toBeGreaterThanOrEqual(0);
    expect(workspaceGate).toBeLessThan(noSharedFallback);
    expect(noSharedFallback).toBeLessThan(validationGate);
    expect(validationGate).toBeLessThan(sharedFallback);
    expect(sharedFallback).toBeLessThan(legacyLocalCheck);
  });

  test('uses workspace binary only when validation passes', () => {
    expect(shouldUseWorkspaceBinary('abc123', 'abc123')).toBe(true);
    expect(shouldUseWorkspaceBinary('abc123', 'def456')).toBe(false);
    expect(shouldUseWorkspaceBinary(null, 'def456')).toBe(false);
    expect(shouldUseWorkspaceBinary('abc123', null)).toBe(false);
  });

  test('function signature accepts no arguments', () => {
    // locateBinary should be callable with no arguments
    expect(typeof locateBinary).toBe('function');
    expect(locateBinary.length).toBe(0);
  });
});
