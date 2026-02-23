#!/usr/bin/env tsx
/**
 * Migration script: bulk ingest existing memory files into Hindsight.
 *
 * Usage:
 *   npm run migrate -- --workspace ~/.openclaw/workspace [--bank sapphira] [--url http://localhost:8888]
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const args = process.argv.slice(2);

function getArg(name: string, defaultVal: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const workspace = getArg('workspace', `${process.env.HOME}/.openclaw/workspace`);
const bankId = getArg('bank', 'sapphira');
const baseUrl = getArg('url', process.env.HINDSIGHT_URL || 'http://localhost:8888');
const dryRun = args.includes('--dry-run');

interface RetainItem {
  content: string;
  context: string;
  document_id: string;
  timestamp?: string;
}

async function retainItems(items: RetainItem[]): Promise<void> {
  const response = await fetch(`${baseUrl}/v1/default/banks/${bankId}/memories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, async: false }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Retain failed: ${response.status} ${text}`);
  }

  const result = await response.json() as { success: boolean; usage?: { total_tokens: number } };
  if (!result.success) {
    throw new Error('Retain returned success: false');
  }
}

async function collectFiles(): Promise<Array<{ path: string; content: string; context: string; timestamp?: string }>> {
  const files: Array<{ path: string; content: string; context: string; timestamp?: string }> = [];

  // 1. MEMORY.md (highest signal — process first)
  try {
    const memoryPath = join(workspace, 'MEMORY.md');
    const content = await readFile(memoryPath, 'utf-8');
    if (content.trim()) {
      files.push({
        path: 'MEMORY.md',
        content,
        context: 'curated long-term memory',
      });
    }
  } catch { /* MEMORY.md may not exist */ }

  // 2. memory/*.md daily notes (sorted newest first for priority)
  try {
    const memoryDir = join(workspace, 'memory');
    const entries = await readdir(memoryDir);
    const mdFiles = entries
      .filter((f) => f.endsWith('.md'))
      .sort()
      .reverse(); // newest first

    for (const file of mdFiles) {
      try {
        const content = await readFile(join(memoryDir, file), 'utf-8');
        if (!content.trim()) continue;

        const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
        files.push({
          path: `memory/${file}`,
          content,
          context: 'daily memory log',
          timestamp: dateMatch ? `${dateMatch[1]}T00:00:00Z` : undefined,
        });
      } catch { /* skip unreadable files */ }
    }
  } catch { /* memory dir may not exist */ }

  return files;
}

async function main() {
  console.log(`🧠 Hindsight Memory Migration`);
  console.log(`   Workspace: ${workspace}`);
  console.log(`   Bank: ${bankId}`);
  console.log(`   URL: ${baseUrl}`);
  console.log(`   Dry run: ${dryRun}`);
  console.log();

  // Check Hindsight health
  if (!dryRun) {
    try {
      const res = await fetch(`${baseUrl}/v1/default/banks`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log('✅ Hindsight is reachable\n');
    } catch (err) {
      console.error(`❌ Cannot reach Hindsight at ${baseUrl}: ${String(err)}`);
      process.exit(1);
    }
  }

  const files = await collectFiles();
  console.log(`Found ${files.length} memory files to migrate:\n`);

  for (const file of files) {
    const sizeKB = (Buffer.byteLength(file.content, 'utf-8') / 1024).toFixed(1);
    console.log(`  📄 ${file.path} (${sizeKB} KB) — ${file.context}`);
  }
  console.log();

  if (dryRun) {
    console.log('🔍 Dry run — no changes made.');
    return;
  }

  // Migrate one file at a time (retain calls can be slow with LLM processing)
  let succeeded = 0;
  let failed = 0;
  let totalTokens = 0;

  for (const file of files) {
    process.stdout.write(`  Retaining ${file.path}... `);
    try {
      const startTime = Date.now();
      await retainItems([{
        content: file.content,
        context: file.context,
        document_id: file.path,
        timestamp: file.timestamp,
      }]);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ (${elapsed}s)`);
      succeeded++;
    } catch (err) {
      console.log(`❌ ${String(err)}`);
      failed++;
    }
  }

  console.log();
  console.log(`📊 Migration complete:`);
  console.log(`   ✅ Succeeded: ${succeeded}`);
  if (failed > 0) console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📄 Total files: ${files.length}`);
}

main().catch((err) => {
  console.error(`Fatal: ${String(err)}`);
  process.exit(1);
});
