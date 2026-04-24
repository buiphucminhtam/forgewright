#!/usr/bin/env python3
"""
Forgewright Local Memory CLI
Usage:
    python memory_cli.py add "text to remember" [--category conversation]
    python memory_cli.py search "query"
    python memory_cli.py list [--category project] [--limit 10]
    python memory_cli.py stats
    python memory_cli.py clear
"""

import argparse
import sys
import json
from datetime import datetime

from local_memory import get_client


def cmd_add(client, args):
    """Add a memory."""
    result = client.add(
        text=args.text,
        category=args.category or "general",
        source=args.source or "cli",
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))


def cmd_search(client, args):
    """Search memories."""
    results = client.search(
        query=args.query,
        limit=args.limit,
        category=args.category,
    )
    
    if not results:
        print("No results found.")
        return
    
    for r in results:
        print(f"\n[{r['id']}] {r['created']} ({r['category']})")
        print(f"  {r['text'][:200]}{'...' if len(r['text']) > 200 else ''}")
        print(f"  Score: {r.get('score', 0):.3f}")


def cmd_list(client, args):
    """List memories."""
    results = client.list(
        category=args.category,
        limit=args.limit,
    )
    
    if not results:
        print("No memories stored.")
        return
    
    print(f"Total: {len(results)} memories\n")
    for r in results:
        print(f"[{r['id']}] {r['created']} ({r['category']})")
        print(f"  {r['text'][:150]}{'...' if len(r['text']) > 150 else ''}")


def cmd_stats(client, args):
    """Show statistics."""
    stats = client.stats()
    print(json.dumps(stats, indent=2, ensure_ascii=False))


def cmd_clear(client, args):
    """Clear all memories."""
    count = client.clear()
    print(f"Cleared {count} memories.")


def main():
    parser = argparse.ArgumentParser(description="Forgewright Local Memory CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # add
    p_add = subparsers.add_parser("add", help="Add a memory")
    p_add.add_argument("text", help="Text to remember")
    p_add.add_argument("--category", "-c", help="Category (default: general)")
    p_add.add_argument("--source", "-s", help="Source (default: cli)")
    p_add.set_defaults(func=cmd_add)
    
    # search
    p_search = subparsers.add_parser("search", help="Search memories")
    p_search.add_argument("query", help="Search query")
    p_search.add_argument("--category", "-c", help="Filter by category")
    p_search.add_argument("--limit", "-l", type=int, default=5, help="Max results (default: 5)")
    p_search.set_defaults(func=cmd_search)
    
    # list
    p_list = subparsers.add_parser("list", help="List memories")
    p_list.add_argument("--category", "-c", help="Filter by category")
    p_list.add_argument("--limit", "-l", type=int, default=20, help="Max results (default: 20)")
    p_list.set_defaults(func=cmd_list)
    
    # stats
    p_stats = subparsers.add_parser("stats", help="Show statistics")
    p_stats.set_defaults(func=cmd_stats)
    
    # clear
    p_clear = subparsers.add_parser("clear", help="Clear all memories")
    p_clear.set_defaults(func=cmd_clear)
    
    args = parser.parse_args()
    
    try:
        client = get_client()
        args.func(client, args)
    except KeyboardInterrupt:
        print("\nAborted.")
        sys.exit(130)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
