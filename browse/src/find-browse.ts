/**
 * find-browse — locate the gstack browse binary.
 *
 * Compiled to browse/dist/find-browse (standalone binary, no bun runtime needed).
 * Outputs the absolute path to the browse binary on stdout, or exits 1 if not found.
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

// ─── Binary Discovery ───────────────────────────────────────────

function getGitRoot(): string | null {
  try {
    const proc = Bun.spawnSync(['git', 'rev-parse', '--show-toplevel'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (proc.exitCode !== 0) return null;
    return proc.stdout.toString().trim();
  } catch {
    return null;
  }
}

function readVersionHash(binaryPath: string): string | null {
  try {
    const versionPath = join(dirname(binaryPath), '.version');
    return readFileSync(versionPath, 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

export function shouldUseWorkspaceBinary(workspaceVersion: string | null, sharedVersion: string | null): boolean {
  if (!workspaceVersion || !sharedVersion) return false;
  return workspaceVersion === sharedVersion;
}

function isValidatedWorkspaceBinary(workspace: string, shared: string): boolean {
  return shouldUseWorkspaceBinary(readVersionHash(workspace), readVersionHash(shared));
}

export function locateBinary(): string | null {
  const root = getGitRoot();
  const home = homedir();
  const workspace = root ? join(root, '.gstack', 'browse', 'dist', 'browse') : null;
  const shared = join(home, '.gstack', 'browse', 'dist', 'browse');
  const markers = ['.codex', '.agents', '.claude'];

  if (workspace && existsSync(workspace)) {
    if (!existsSync(shared)) return workspace;
    if (isValidatedWorkspaceBinary(workspace, shared)) {
      return workspace;
    }
  }

  if (existsSync(shared)) return shared;

  // Legacy fallback for older installs
  if (root) {
    for (const m of markers) {
      const local = join(root, m, 'skills', 'gstack', 'browse', 'dist', 'browse');
      if (existsSync(local)) return local;
    }
  }

  for (const m of markers) {
    const global = join(home, m, 'skills', 'gstack', 'browse', 'dist', 'browse');
    if (existsSync(global)) return global;
  }

  return null;
}

// ─── Main ───────────────────────────────────────────────────────

function main() {
  const bin = locateBinary();
  if (!bin) {
    process.stderr.write('ERROR: browse binary not found. Run: cd <skill-dir> && ./setup\n');
    process.exit(1);
  }

  console.log(bin);
}

main();
