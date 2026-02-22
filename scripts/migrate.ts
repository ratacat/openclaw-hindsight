#!/usr/bin/env tsx
// Migration script: ingest existing memory files into Hindsight
// Usage: npm run migrate -- --bank sapphira --workspace ~/.openclaw/workspace

// TODO: Implement
// 1. Parse CLI args (bank, workspace path)
// 2. Read MEMORY.md first (high-signal curated content)
// 3. Read memory/YYYY-MM-DD.md files (recent first)
// 4. For each file, call retain with:
//    - document_id: file path
//    - context: "daily memory log" or "curated long-term memory"
//    - timestamp: from filename or mtime
//    - metadata: { source: "workspace", path: relative path, type: "daily_log" | "long_term" }
// 5. Report progress and any errors

console.log('Migration script not yet implemented');
