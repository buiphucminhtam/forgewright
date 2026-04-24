#!/usr/bin/env python3
"""
Graphiti CLI — Temporal Knowledge Graph Memory for Forgewright

Usage:
    graphiti-cli.py <command> [options]

Commands:
    setup           Initial setup (check dependencies, create graph)
    add <text>      Add memory to graph
    search <query>  Search with temporal filtering
    history <entity> Get entity timeline
    list            List all memories
    stats           Graph statistics
    gc              Garbage collect old episodes
    migrate         Migrate from mem0-cli memory.jsonl
    health          Check system health

Options:
    --category      Category (decisions, architecture, general, etc.)
    --source        Source (cli, session, ingest, etc.)
    --when          Time filter (e.g., "last 7 days", "in April 2026")
    --limit         Max results (default: 5)
    --format        Output format (compact, full, json)

Examples:
    graphiti-cli.py add "Using Graphiti for temporal memory" --category architecture
    graphiti-cli.py search "memory system" --when "last 30 days"
    graphiti-cli.py history "Graphiti"
    graphiti-cli.py search "decisions" --category decisions --limit 10
"""

import os
import sys
import json
import asyncio
import subprocess
from datetime import datetime
from pathlib import Path

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))

from graphiti_client import (
    GraphitiClient,
    SyncGraphitiClient,
    TemporalQueryParser,
    TimeFilter,
    GRAPHITI_AVAILABLE,
    DEFAULT_GRAPH_NAME,
)


# ── Constants ──

FORGEWRIGHT_DIR = ".forgewright"
MEMORY_LOG = os.path.join(FORGEWRIGHT_DIR, "memory.jsonl")


# ── Helpers ──

def print_success(msg: str):
    print(f"✅ {msg}")

def print_error(msg: str):
    print(f"❌ {msg}")

def print_warning(msg: str):
    print(f"⚠️ {msg}")

def print_info(msg: str):
    print(f"ℹ️ {msg}")


def check_dependencies():
    """Check if all dependencies are available."""
    issues = []
    
    # Check graphiti-core
    if not GRAPHITI_AVAILABLE:
        issues.append("graphiti-core not installed")
    
    # Check API key configuration
    api_key = os.environ.get("GRAPHITI_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        issues.append("No API key set (GRAPHITI_API_KEY or OPENAI_API_KEY)")
    
    # Check provider configuration
    provider = os.environ.get("GRAPHITI_LLM_PROVIDER", "openai")
    if provider not in ("openai", "anthropic", "gemini", "minimax"):
        issues.append(f"Unsupported provider: {provider}")
    
    # Check Neo4j
    try:
        import neo4j
    except ImportError:
        issues.append("neo4j not installed")
    
    return issues


def check_neo4j_connection():
    """Check if Neo4j is running."""
    try:
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2)
        result = sock.connect_ex(("localhost", 7687))
        sock.close()
        return result == 0
    except Exception:
        return False


# ── Commands ──

def cmd_setup(args):
    """Initial setup - check dependencies and create graph."""
    print("🔧 Graphiti CLI Setup")
    print("=" * 40)
    
    # Check dependencies
    print("\n📋 Checking dependencies...")
    issues = check_dependencies()
    
    if issues:
        print("\n❌ Setup failed. Issues found:")
        for issue in issues:
            print(f"   • {issue}")
        print("\n📖 To fix:")
        print("   1. pip install -r requirements-graphiti.txt")
        print("   2. Set API key: export GRAPHITI_API_KEY=sk-...")
        print("   3. docker-compose -f docker-compose.graphiti.yml up -d")
        return 1
    
    print_success("All dependencies available")
    
    # Check Neo4j connection
    print("\n🔌 Checking Neo4j connection...")
    if not check_neo4j_connection():
        print_warning("Neo4j not running")
        print("   Start with: docker-compose -f docker-compose.graphiti.yml up -d")
        print("   Or: docker run -p 7474:7474 -p 7687:7687 neo4j:latest")
        return 1
    
    print_success("Neo4j connected")
    
    # Check API configuration
    print("\n🔑 Checking API Configuration...")
    api_key = os.environ.get("GRAPHITI_API_KEY") or os.environ.get("OPENAI_API_KEY")
    provider = os.environ.get("GRAPHITI_LLM_PROVIDER", "openai")
    
    if api_key:
        print_success(f"API key configured (provider: {provider})")
    else:
        print_warning("No API key found")
        print("   Set: export GRAPHITI_API_KEY=sk-...")
        print("   Or: export OPENAI_API_KEY=sk-...")
    
    # Create Forgewright directory
    print("\n📁 Creating directories...")
    os.makedirs(FORGEWRIGHT_DIR, exist_ok=True)
    print_success(f"{FORGEWRIGHT_DIR}/ ready")
    
    print("\n" + "=" * 40)
    print_success("Setup complete!")
    print("\nNext steps:")
    print("   1. Migrate existing memory: python3 scripts/graphiti-cli.py migrate")
    print("   2. Add a memory: graphiti-cli.py add \"Hello Graphiti\"")
    print("   3. Search: graphiti-cli.py search \"Graphiti\"")
    
    return 0


def cmd_add(args):
    """Add memory to graph."""
    if not args:
        print_error("Usage: graphiti-cli.py add <text> [--category <cat>] [--source <src>]")
        return 1
    
    text = " ".join(args)
    category = "general"
    source = "cli"
    
    # Parse options
    i = 0
    while i < len(args):
        if args[i] == "--category" and i + 1 < len(args):
            category = args[i + 1]
            i += 2
        elif args[i] == "--source" and i + 1 < len(args):
            source = args[i + 1]
            i += 2
        else:
            i += 1
    
    try:
        client = SyncGraphitiClient()
        result = client.add_memory(text, category=category, source=source)
        
        print_success(f"Memory added")
        print(f"   ID: {result['id']}")
        print(f"   Category: {result['category']}")
        print(f"   Episode: {result.get('episode_id', 'N/A')}")
        
        return 0
    except Exception as e:
        print_error(f"Failed to add memory: {e}")
        return 1


def cmd_search(args):
    """Search memories with optional temporal filter."""
    if not args:
        print_error("Usage: graphiti-cli.py search <query> [--when <time>] [--category <cat>] [--limit N] [--format compact|full|json]")
        return 1
    
    query = args[0]
    time_filter = None
    category = None
    limit = 5
    fmt = "compact"
    
    # Parse options
    i = 1
    while i < len(args):
        if args[i] == "--when" and i + 1 < len(args):
            time_expr = args[i + 1]
            time_filter = TemporalQueryParser.parse(time_expr)
            print(f"   📅 Time filter: {time_expr}")
            i += 2
        elif args[i] == "--category" and i + 1 < len(args):
            category = args[i + 1]
            i += 2
        elif args[i] == "--limit" and i + 1 < len(args):
            limit = int(args[i + 1])
            i += 2
        elif args[i] == "--format" and i + 1 < len(args):
            fmt = args[i + 1]
            i += 2
        else:
            i += 1
    
    try:
        client = SyncGraphitiClient()
        results = client.search(query, limit=limit, time_filter=time_filter, categories=[category] if category else None)
        
        if not results:
            print("No memories found.")
            return 0
        
        if fmt == "json":
            print(json.dumps([
                {"id": r.id, "text": r.text, "category": r.category, "created": r.created.isoformat(), "score": r.score}
                for r in results
            ], indent=2))
        elif fmt == "full":
            for r in results:
                print(f"\n--- [{r.id}] ---")
                print(f"Category: {r.category}")
                print(f"Created: {r.created}")
                print(f"Score: {r.score:.3f}")
                print(f"Entities: {', '.join(r.entities) if r.entities else 'None'}")
                print(f"\n{r.text}")
        else:  # compact
            for r in results:
                cat = f"[{r.category}]" if r.category else ""
                text = r.text.replace("\n", " ")[:100]
                print(f"  • {cat} {text} ({r.created.strftime('%Y-%m-%d')})")
        
        return 0
    except Exception as e:
        print_error(f"Search failed: {e}")
        return 1


def cmd_history(args):
    """Get entity timeline/history."""
    if not args:
        print_error("Usage: graphiti-cli.py history <entity> [--limit N]")
        return 1
    
    entity = args[0]
    limit = 20
    
    # Parse options
    if "--limit" in args:
        i = args.index("--limit")
        if i + 1 < len(args):
            limit = int(args[i + 1])
    
    try:
        client = SyncGraphitiClient()
        history = client.get_entity_history(entity, limit=limit)
        
        if not history:
            print(f"No history found for '{entity}'.")
            return 0
        
        print(f"📜 History for '{entity}' ({len(history)} entries)")
        print("=" * 50)
        
        for i, h in enumerate(history, 1):
            created = h.get("created", "Unknown")
            if created:
                try:
                    dt = datetime.fromisoformat(created)
                    created = dt.strftime("%Y-%m-%d %H:%M")
                except Exception:
                    pass
            
            print(f"\n{i}. {created}")
            print(f"   {h['text'][:150]}...")
            
            if h.get("relations"):
                rels = [f"{r.get('source', '?')} → {r.get('target', '?')}" for r in h["relations"][:3]]
                print(f"   Relations: {', '.join(rels)}")
        
        return 0
    except Exception as e:
        print_error(f"History failed: {e}")
        return 1


def cmd_list(args):
    """List all memories."""
    category = None
    limit = 20
    
    # Parse options
    i = 0
    while i < len(args):
        if args[i] == "--category" and i + 1 < len(args):
            category = args[i + 1]
            i += 2
        elif args[i] == "--limit" and i + 1 < len(args):
            limit = int(args[i + 1])
            i += 2
        else:
            i += 1
    
    try:
        client = SyncGraphitiClient()
        memories = client.list_memories(category=category, limit=limit)
        
        if not memories:
            print("No memories stored.")
            return 0
        
        print(f"📚 Memories ({len(memories)} entries)")
        print("=" * 50)
        
        for m in memories:
            cat = f"[{m.get('category', 'general')}]"
            text = m.get("text", "").replace("\n", " ")[:80]
            created = m.get("created", "")
            if created:
                try:
                    dt = datetime.fromisoformat(created)
                    created = dt.strftime("%Y-%m-%d %H:%M")
                except Exception:
                    pass
            print(f"  • {cat} {text} ({created})")
        
        return 0
    except Exception as e:
        print_error(f"List failed: {e}")
        return 1


def cmd_stats(args):
    """Show graph statistics."""
    try:
        client = SyncGraphitiClient()
        stats = client.stats()
        
        print("📊 Graph Statistics")
        print("=" * 40)
        print(f"Graph name: {stats.get('graph_name', DEFAULT_GRAPH_NAME)}")
        
        if "error" in stats:
            print_error(f"Error: {stats['error']}")
            return 1
        
        print(f"Total episodes: {stats.get('total_episodes', 0)}")
        print(f"Total facts: {stats.get('total_facts', 0)}")
        
        categories = stats.get("categories", {})
        if categories:
            print("\nBy category:")
            for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
                weight = {"decisions": "⭐⭐⭐", "architecture": "⭐⭐", "project": "⭐⭐", 
                         "general": "⭐", "conversation": "⭐"}.get(cat, "")
                print(f"  {cat}: {count} {weight}")
        
        return 0
    except Exception as e:
        print_error(f"Stats failed: {e}")
        return 1


def cmd_gc(args):
    """Garbage collect old episodes."""
    max_episodes = 100
    
    # Parse options
    if "--max" in args:
        i = args.index("--max")
        if i + 1 < len(args):
            max_episodes = int(args[i + 1])
    
    try:
        client = SyncGraphitiClient()
        removed = client.gc(max_episodes=max_episodes)
        
        if removed > 0:
            print_success(f"GC complete: removed {removed} old episodes")
        else:
            print_info("No episodes to remove (under limit)")
        
        return 0
    except Exception as e:
        print_error(f"GC failed: {e}")
        return 1


def cmd_migrate(args):
    """Migrate from mem0-cli memory.jsonl."""
    dry_run = "--dry-run" in args
    
    print("🔄 Memory Migration: mem0-cli → Graphiti")
    print("=" * 40)
    
    # Check source file
    if not Path(MEMORY_LOG).exists():
        print_error(f"Source file not found: {MEMORY_LOG}")
        print("Nothing to migrate.")
        return 1
    
    # Load entries
    entries = []
    with open(MEMORY_LOG, "r") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    
    if not entries:
        print_info("No entries to migrate.")
        return 0
    
    print(f"Found {len(entries)} entries to migrate")
    
    if dry_run:
        print_warning("DRY RUN - no changes will be made")
        print("\nSample entries:")
        for e in entries[:3]:
            print(f"  • [{e.get('category', 'general')}] {e.get('memory', '')[:50]}...")
        return 0
    
    # Backup first
    backup_file = f"{MEMORY_LOG}.backup-{datetime.now().strftime('%Y%m%d')}"
    import shutil
    shutil.copy(MEMORY_LOG, backup_file)
    print_success(f"Backup created: {backup_file}")
    
    # Migrate
    print("\nMigrating entries...")
    client = SyncGraphitiClient()
    migrated = 0
    errors = 0
    
    for i, entry in enumerate(entries):
        try:
            text = entry.get("memory", "")
            category = entry.get("category", "general")
            source = entry.get("source", "migrated")
            
            client.add_memory(text, category=category, source=source)
            migrated += 1
            
            if (i + 1) % 10 == 0:
                print(f"   Migrated {i + 1}/{len(entries)}...")
        except Exception as e:
            errors += 1
            if errors <= 3:
                print_warning(f"Error migrating entry: {e}")
    
    print("\n" + "=" * 40)
    print_success(f"Migration complete!")
    print(f"   Migrated: {migrated}")
    print(f"   Errors: {errors}")
    print(f"\nOriginal file preserved at: {backup_file}")
    print(f"Original file still at: {MEMORY_LOG}")
    
    return 0


def cmd_health(args):
    """Check system health."""
    print("🏥 System Health Check")
    print("=" * 40)
    
    all_ok = True
    
    # Check dependencies
    print("\n📦 Dependencies:")
    issues = check_dependencies()
    if issues:
        for issue in issues:
            print(f"   ❌ {issue}")
        all_ok = False
    else:
        print_success("All Python dependencies available")
    
    # Check API configuration
    print("\n🔑 LLM API Configuration:")
    api_key = os.environ.get("GRAPHITI_API_KEY") or os.environ.get("OPENAI_API_KEY")
    provider = os.environ.get("GRAPHITI_LLM_PROVIDER", "openai")
    model = os.environ.get("GRAPHITI_LLM_MODEL", "gpt-4o-mini")
    
    if api_key:
        print_success(f"API configured (provider: {provider}, model: {model})")
    else:
        print_error("No API key configured")
        print("   Set: export GRAPHITI_API_KEY=sk-...")
        all_ok = False
    
    # Check Neo4j
    print("\n🗄️ Neo4j:")
    if check_neo4j_connection():
        print_success("Neo4j running")
        try:
            client = SyncGraphitiClient()
            stats = client.stats()
            print(f"   Graph: {stats.get('graph_name', DEFAULT_GRAPH_NAME)}")
            print(f"   Episodes: {stats.get('total_episodes', 0)}")
        except Exception as e:
            print_warning(f"Cannot access graph: {e}")
    else:
        print_error("Neo4j not running")
        print("   Start with: docker-compose -f docker-compose.graphiti.yml up -d")
        all_ok = False
    
    print("\n" + "=" * 40)
    if all_ok:
        print_success("All systems operational")
        return 0
    else:
        print_warning("Some issues detected")
        return 1


# ── Main ──

COMMANDS = {
    "setup": cmd_setup,
    "add": cmd_add,
    "search": cmd_search,
    "history": cmd_history,
    "list": cmd_list,
    "stats": cmd_stats,
    "gc": cmd_gc,
    "migrate": cmd_migrate,
    "health": cmd_health,
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        print("\nCommands:", ", ".join(COMMANDS.keys()))
        return 0
    
    cmd = sys.argv[1]
    if cmd not in COMMANDS:
        print_error(f"Unknown command: {cmd}")
        print("Available commands:", ", ".join(COMMANDS.keys()))
        return 1
    
    return COMMANDS[cmd](sys.argv[2:])


if __name__ == "__main__":
    sys.exit(main())
