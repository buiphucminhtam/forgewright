#!/usr/bin/env python3
"""
Migrate memories from memory.jsonl (legacy) to ChromaDB (new local_memory system).

Usage:
    python3 scripts/migrate-memory-to-local.py [--dry-run] [--backup]

Options:
    --dry-run  Preview migration without making changes
    --backup   Create backup of memory.jsonl before migration
"""

import argparse
import json
import os
import sys
from pathlib import Path
from datetime import datetime

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.local_memory import LocalMemoryClient


def load_jsonl(filepath: Path) -> list[dict]:
    """Load memories from JSONL file."""
    memories = []
    if not filepath.exists():
        print(f"  ⚠ File not found: {filepath}")
        return memories
    
    with open(filepath, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                memories.append(json.loads(line))
            except json.JSONDecodeError as e:
                print(f"  ⚠ Skipping line {line_num}: {e}")
    
    return memories


def migrate_memories(dry_run: bool = False, backup: bool = False) -> dict:
    """Migrate memories from memory.jsonl to ChromaDB."""
    project_root = Path(__file__).parent.parent
    jsonl_path = project_root / ".forgewright" / "memory.jsonl"
    
    print("=" * 60)
    print("Memory Migration: JSONL → ChromaDB")
    print("=" * 60)
    print()
    
    # Load existing memories
    print(f"📂 Loading memories from: {jsonl_path}")
    memories = load_jsonl(jsonl_path)
    print(f"   Found {len(memories)} memories")
    print()
    
    if not memories:
        print("✅ No memories to migrate")
        return {"total": 0, "migrated": 0, "skipped": 0}
    
    # Stats
    categories = {}
    sources = {}
    for m in memories:
        cat = m.get("category", "unknown")
        src = m.get("source", "unknown")
        categories[cat] = categories.get(cat, 0) + 1
        sources[src] = sources.get(src, 0) + 1
    
    print("📊 Memory breakdown by category:")
    for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
        print(f"   - {cat}: {count}")
    print()
    
    print("📊 Memory breakdown by source:")
    for src, count in sorted(sources.items(), key=lambda x: -x[1]):
        print(f"   - {src}: {count}")
    print()
    
    if dry_run:
        print("🔍 DRY RUN - No changes will be made")
        print()
        for i, m in enumerate(memories[:10], 1):
            print(f"   {i}. [{m.get('category', 'unknown')}] {m.get('memory', '')[:80]}...")
        if len(memories) > 10:
            print(f"   ... and {len(memories) - 10} more")
        print()
        return {"total": len(memories), "migrated": 0, "skipped": 0}
    
    # Create backup if requested
    if backup and jsonl_path.exists():
        backup_path = jsonl_path.with_suffix(f'.jsonl.backup.{datetime.now().strftime("%Y%m%d_%H%M%S")}')
        print(f"💾 Creating backup: {backup_path}")
        import shutil
        shutil.copy2(jsonl_path, backup_path)
        print()
    
    # Initialize new memory client
    print("🔄 Initializing ChromaDB client...")
    try:
        client = LocalMemoryClient()
    except Exception as e:
        print(f"❌ Failed to initialize ChromaDB: {e}")
        return {"total": len(memories), "migrated": 0, "skipped": len(memories)}
    
    # Migrate memories
    print("📥 Migrating memories...")
    migrated = 0
    skipped = 0
    errors = []
    
    for i, m in enumerate(memories, 1):
        try:
            # Extract text from memory field
            text = m.get("memory", "")
            if not text:
                text = m.get("text", m.get("content", ""))
            
            if not text:
                skipped += 1
                continue
            
            # Get metadata
            category = m.get("category", "general")
            source = m.get("source", "migrated")
            created = m.get("created", "")
            
            # Add to new system
            client.add(
                text=text,
                category=category,
                source=source,
                metadata={"migrated_from": "memory.jsonl", "original_id": m.get("id", "")}
            )
            migrated += 1
            
            if i % 20 == 0:
                print(f"   Progress: {i}/{len(memories)} migrated...")
                
        except Exception as e:
            errors.append(f"Memory {m.get('id', 'unknown')}: {e}")
            skipped += 1
    
    print()
    
    # Final stats
    print("=" * 60)
    print("Migration Complete")
    print("=" * 60)
    print(f"   Total memories: {len(memories)}")
    print(f"   ✅ Migrated: {migrated}")
    print(f"   ⚠️  Skipped: {skipped}")
    if errors:
        print(f"   ❌ Errors: {len(errors)}")
        for err in errors[:5]:
            print(f"       - {err}")
    
    # Show new system stats
    print()
    print("📊 New memory system stats:")
    stats = client.stats()
    print(f"   - Total: {stats['total']}")
    print(f"   - Categories: {stats['categories']}")
    
    return {
        "total": len(memories),
        "migrated": migrated,
        "skipped": skipped,
        "errors": errors
    }


def main():
    parser = argparse.ArgumentParser(description="Migrate memories from JSONL to ChromaDB")
    parser.add_argument("--dry-run", action="store_true", help="Preview without making changes")
    parser.add_argument("--backup", action="store_true", help="Create backup before migration")
    args = parser.parse_args()
    
    result = migrate_memories(dry_run=args.dry_run, backup=args.backup)
    
    if args.dry_run:
        print("\n💡 To execute migration, run without --dry-run:")
        print("   python3 scripts/migrate-memory-to-local.py --backup")
    
    return 0 if result["skipped"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
