#!/usr/bin/env bun

/**
 * skill:check - Health summary for all SKILL.md files.
 *
 * Reports:
 *   - Command validation (valid/invalid/snapshot errors)
 *   - Template coverage (which SKILL.md files have .tmpl sources)
 *   - Generated agents-skill coverage
 *   - Freshness check (generated files match committed files)
 */

import * as fs from "fs";
import * as path from "path";
import { validateSkill } from "../test/helpers/skill-parser";
import {
	codexSkillName,
	GENERATED_HOSTS,
	type GeneratedHostId,
	generatedHostLabel,
	HOSTS,
	LAYOUTS,
	RUNTIME_SIDECAR_ASSETS,
} from "./host-registry";

const ROOT = path.resolve(import.meta.dir, "..");
const AGENTS_DIR = path.join(ROOT, ".agents", "skills");
const SHARED_RUNTIME_ROOT = path.join(process.env.HOME ?? "~", ".gstack");
const WORKSPACE_RUNTIME_ROOT = path.join(ROOT, ".gstack");

function findTemplateSkillDirs(): string[] {
	const dirs: string[] = [];
	if (fs.existsSync(path.join(ROOT, "SKILL.md.tmpl"))) dirs.push("");

	for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
		if (
			!entry.isDirectory() ||
			entry.name.startsWith(".") ||
			entry.name === "node_modules"
		)
			continue;
		if (fs.existsSync(path.join(ROOT, entry.name, "SKILL.md.tmpl")))
			dirs.push(entry.name);
	}

	return dirs;
}

function templateMappings() {
	return findTemplateSkillDirs().map((dir) => ({
		tmpl: dir === "" ? "SKILL.md.tmpl" : `${dir}/SKILL.md.tmpl`,
		output: dir === "" ? "SKILL.md" : `${dir}/SKILL.md`,
	}));
}

function expectedAgentsSkillDirs(): string[] {
	const agentsLayout = LAYOUTS[HOSTS.codex.layoutId];
	return findTemplateSkillDirs()
		.filter((dir) => !agentsLayout.excludedSkills.includes(dir))
		.map((dir) => codexSkillName(dir))
		.sort();
}

function runDryRun(hostId: GeneratedHostId) {
	const args = ["bun", "run", "scripts/gen-skill-docs.ts"];
	if (hostId !== "claude") args.push("--host", hostId);
	args.push("--dry-run");
	return Bun.spawnSync(args, { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
}

function reportRuntimeHome(label: string, runtimeRoot: string) {
	if (!fs.existsSync(runtimeRoot)) {
		console.log(
			`  WARNING ${label.padEnd(30)} - not materialized (run: ./setup --host codex)`,
		);
		return;
	}

	const missingAssets = RUNTIME_SIDECAR_ASSETS.filter((asset) =>
		!fs.existsSync(path.join(runtimeRoot, asset)),
	);
	if (missingAssets.length > 0) {
		console.log(
			`  WARNING ${label.padEnd(30)} - missing assets: ${missingAssets.join(", ")} (run: ./setup --host codex)`,
		);
		return;
	}

	console.log(`  OK    ${label.padEnd(30)} - present`);
}

const generatedSkillFiles = templateMappings().map(({ output }) => output);
let hasErrors = false;

console.log("  Skills:");
for (const file of generatedSkillFiles) {
	const fullPath = path.join(ROOT, file);
	const result = validateSkill(fullPath);

	if (result.warnings.length > 0) {
		console.log(`  WARNING ${file.padEnd(30)} - ${result.warnings.join(", ")}`);
		continue;
	}

	const totalValid = result.valid.length;
	const totalInvalid = result.invalid.length;
	const totalSnapErrors = result.snapshotFlagErrors.length;

	if (totalInvalid > 0 || totalSnapErrors > 0) {
		hasErrors = true;
		console.log(
			`  ERROR ${file.padEnd(30)} - ${totalValid} valid, ${totalInvalid} invalid, ${totalSnapErrors} snapshot errors`,
		);
		for (const inv of result.invalid) {
			console.log(`      line ${inv.line}: unknown command '${inv.command}'`);
		}
		for (const se of result.snapshotFlagErrors) {
			console.log(`      line ${se.command.line}: ${se.error}`);
		}
	} else {
		console.log(
			`  OK    ${file.padEnd(30)} - ${totalValid} commands, all valid`,
		);
	}
}

console.log("\n  Templates:");
for (const { tmpl, output } of templateMappings()) {
	const tmplPath = path.join(ROOT, tmpl);
	const outPath = path.join(ROOT, output);
	if (!fs.existsSync(tmplPath)) {
		console.log(`  WARNING ${output.padEnd(30)} - no template`);
		continue;
	}
	if (!fs.existsSync(outPath)) {
		hasErrors = true;
		console.log(
			`  ERROR ${output.padEnd(30)} - generated file missing! Run: bun run gen:skill-docs`,
		);
		continue;
	}
	console.log(`  OK    ${tmpl.padEnd(30)} -> ${output}`);
}

console.log("\n  Agents Skills (.agents/skills/):");
if (!fs.existsSync(AGENTS_DIR)) {
	console.log(
		"  ERROR .agents/skills/ not found (run: bun run gen:skill-docs --host codex)",
	);
	hasErrors = true;
} else {
	const expectedDirs = expectedAgentsSkillDirs();
	const actualDiscoverableDirs = fs
		.readdirSync(AGENTS_DIR)
		.filter((dir) => dir.startsWith("gstack-"))
		.sort();

	for (const dir of expectedDirs) {
		const skillMd = path.join(AGENTS_DIR, dir, "SKILL.md");
		if (!fs.existsSync(skillMd)) {
			hasErrors = true;
			console.log(`  ERROR ${dir.padEnd(30)} - SKILL.md missing`);
			continue;
		}

		const content = fs.readFileSync(skillMd, "utf-8");
		if (content.includes(".claude/skills") || content.includes("~/.claude/")) {
			hasErrors = true;
			console.log(`  ERROR ${dir.padEnd(30)} - contains Claude path reference`);
			continue;
		}

		console.log(`  OK    ${dir.padEnd(30)} - OK`);
	}

	for (const dir of actualDiscoverableDirs) {
		if (!expectedDirs.includes(dir)) {
			hasErrors = true;
			console.log(
				`  ERROR ${dir.padEnd(30)} - unexpected generated agents skill`,
			);
		}
	}

	const rootSkill = path.join(AGENTS_DIR, "gstack", "SKILL.md");
	if (!fs.existsSync(rootSkill)) {
		hasErrors = true;
		console.log("  ERROR gstack                         - root generated SKILL.md missing");
	} else {
		console.log("  OK    gstack                         - root generated skill present");
	}
}

console.log("\n  Runtime Homes:");
reportRuntimeHome("shared runtime home", SHARED_RUNTIME_ROOT);
reportRuntimeHome("workspace runtime home", WORKSPACE_RUNTIME_ROOT);

for (const hostId of GENERATED_HOSTS) {
	const label = generatedHostLabel(hostId);
	console.log(`\n  Freshness (${label}):`);

	const result = runDryRun(hostId);
	if (result.exitCode === 0) {
		console.log(`  OK    All ${label} generated files are fresh`);
		continue;
	}

	hasErrors = true;
	const output = result.stdout.toString();
	console.log(`  ERROR ${label} generated files are stale:`);
	for (const line of output
		.split("\n")
		.filter((entry: string) => entry.startsWith("STALE"))) {
		console.log(`      ${line}`);
	}
	const hint =
		hostId === "claude"
			? "bun run gen:skill-docs"
			: `bun run gen:skill-docs --host ${hostId}`;
	console.log(`      Run: ${hint}`);
}

console.log("");
process.exit(hasErrors ? 1 : 0);
