#!/usr/bin/env python3
"""
Local Memory Client - Forgewright
Simple, fast, no Docker needed.
Uses ChromaDB + local embeddings (sentence-transformers with ONNX).
"""

import os
import json
import sys
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

import chromadb

# Local embeddings - no API key needed
SENTENCE_TRANSFORMERS_AVAILABLE = False
try:
    from sentence_transformers import SentenceTransformer
    import torch
    
    # Check for ONNX availability
    ONNX_AVAILABLE = hasattr(torch, 'onnx')
    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_AVAILABLE = False
    ONNX_AVAILABLE = False


class LocalMemoryClient:
    """
    Simple local memory using ChromaDB + local embeddings.
    
    - No Docker required
    - No API key needed
    - Uses sentence-transformers (all-MiniLM-L6-v2) - ~22MB model
    """
    
    COLLECTION_NAME = "forgewright_memory"
    EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
    
    def __init__(self, db_path: str = "./.forgewright/memory_db"):
        self.db_path = Path(db_path)
        self.db_path.mkdir(parents=True, exist_ok=True)
        
        # Check dependencies
        if not SENTENCE_TRANSFORMERS_AVAILABLE:
            raise RuntimeError(
                "sentence-transformers not installed. Run:\n"
                "  pip install sentence-transformers torch"
            )
        
        # Load embedding model (lazy)
        self._model = None
        
        # ChromaDB client (persistent)
        self.chroma = chromadb.PersistentClient(path=str(self.db_path))
        
        # Collection
        self.collection = self.chroma.get_or_create_collection(
            name=self.COLLECTION_NAME,
            metadata={"description": "Forgewright local memory"}
        )
        
        # JSON backup file
        self._backup_file = self.db_path / "memory_backup.json"
    
    @property
    def model(self):
        """Lazy load model on first use."""
        if self._model is None:
            print(f"[LocalMemory] Loading embedding model: {self.EMBED_MODEL}...")
            self._model = SentenceTransformer(self.EMBED_MODEL)
            print(f"[LocalMemory] Model loaded. Device: {self._model.device}")
        return self._model
    
    def _embed(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings locally using sentence-transformers."""
        embeddings = self.model.encode(texts, normalize_embeddings=True)
        return embeddings.tolist()
    
    def _make_id(self, text: str) -> str:
        """Generate short deterministic ID."""
        return hashlib.sha256(text.encode()).hexdigest()[:12]
    
    # ── Core Operations ──
    
    def add(
        self,
        text: str,
        category: str = "general",
        source: str = "cli",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Add memory."""
        memory_id = self._make_id(text + datetime.now().isoformat())
        created = datetime.now().isoformat(timespec="seconds")
        
        meta = {
            "text": text,
            "category": category,
            "source": source,
            "created": created,
        }
        if metadata:
            meta.update(metadata)
        
        # Add to ChromaDB
        embedding = self._embed([text])[0]
        self.collection.add(
            ids=[memory_id],
            embeddings=[embedding],
            documents=[text],
            metadatas=[meta],
        )
        
        # Backup to JSON
        self._save_backup()
        
        return {
            "id": memory_id,
            **meta,
        }
    
    def search(
        self,
        query: str,
        limit: int = 5,
        category: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Semantic search memories."""
        query_embedding = self._embed([query])[0]
        where = {"category": category} if category else None
        
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=limit,
            where=where,
        )
        
        memories = []
        if results and results["ids"]:
            for doc_id in results["ids"][0]:
                idx = results["ids"][0].index(doc_id)
                memories.append({
                    "id": doc_id,
                    "text": results["documents"][0][idx],
                    "category": results["metadatas"][0][idx].get("category", "general"),
                    "source": results["metadatas"][0][idx].get("source", "unknown"),
                    "created": results["metadatas"][0][idx].get("created", ""),
                    "score": 1 - (results["distances"][0][idx] if results.get("distances") else 0),
                })
        
        return memories
    
    def list(
        self,
        category: Optional[str] = None,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """List memories, newest first."""
        where = {"category": category} if category else None
        
        all_data = self.collection.get(where=where, include=["metadatas", "documents"])
        
        memories = []
        for i, doc_id in enumerate(all_data["ids"]):
            memories.append({
                "id": doc_id,
                "text": all_data["documents"][i],
                "category": all_data["metadatas"][i].get("category", "general"),
                "source": all_data["metadatas"][i].get("source", "unknown"),
                "created": all_data["metadatas"][i].get("created", ""),
            })
        
        memories.sort(key=lambda x: x.get("created", ""), reverse=True)
        return memories[:limit]
    
    def stats(self) -> Dict[str, Any]:
        """Get memory statistics."""
        all_data = self.collection.get(include=["metadatas"])
        
        categories = {}
        for meta in all_data["metadatas"]:
            cat = meta.get("category", "general")
            categories[cat] = categories.get(cat, 0) + 1
        
        return {
            "total": len(all_data["ids"]),
            "categories": categories,
            "embedder": "sentence-transformers",
            "model": self.EMBED_MODEL,
            "storage": str(self.db_path),
        }
    
    def delete(self, memory_id: str) -> bool:
        """Delete a memory by ID."""
        try:
            self.collection.delete(ids=[memory_id])
            self._save_backup()
            return True
        except Exception:
            return False
    
    def clear(self) -> int:
        """Clear all memories. Returns count deleted."""
        all_data = self.collection.get()
        count = len(all_data["ids"])
        if count > 0:
            self.collection.delete(ids=all_data["ids"])
            self._save_backup()
        return count
    
    def _save_backup(self):
        """Save backup to JSON file."""
        all_data = self.collection.get(include=["metadatas", "documents"])
        
        backup = {
            "saved_at": datetime.now().isoformat(),
            "memories": [
                {
                    "id": all_data["ids"][i],
                    "text": all_data["documents"][i],
                    **all_data["metadatas"][i],
                }
                for i in range(len(all_data["ids"]))
            ]
        }
        
        with open(self._backup_file, "w", encoding="utf-8") as f:
            json.dump(backup, f, ensure_ascii=False, indent=2)
    
    def close(self):
        """Close client."""
        pass


# ── Factory ──

_client: Optional[LocalMemoryClient] = None

def get_client() -> LocalMemoryClient:
    """Get singleton client instance."""
    global _client
    if _client is None:
        _client = LocalMemoryClient()
    return _client


# ── CLI Interface ─────────────────────────────────────

def main():
    """Command-line interface for local_memory."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Forgewright Local Memory CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Add command
    add_parser = subparsers.add_parser("add", help="Add a memory")
    add_parser.add_argument("text", help="Memory text to store")
    add_parser.add_argument("--category", "-c", default="general", help="Category (default: general)")
    add_parser.add_argument("--source", "-s", default="cli", help="Source (default: cli)")
    
    # Search command
    search_parser = subparsers.add_parser("search", help="Search memories")
    search_parser.add_argument("query", help="Search query")
    search_parser.add_argument("--limit", "-l", type=int, default=5, help="Max results (default: 5)")
    search_parser.add_argument("--category", "-c", help="Filter by category")
    
    # List command
    list_parser = subparsers.add_parser("list", help="List memories")
    list_parser.add_argument("--category", "-c", help="Filter by category")
    list_parser.add_argument("--limit", "-l", type=int, default=20, help="Max results (default: 20)")
    
    # Stats command
    subparsers.add_parser("stats", help="Show memory statistics")
    
    # Clear command
    subparsers.add_parser("clear", help="Clear all memories")
    
    args = parser.parse_args()
    
    if args.command is None:
        parser.print_help()
        return 1
    
    try:
        client = get_client()
        
        if args.command == "add":
            result = client.add(args.text, category=args.category, source=args.source)
            print(f"✓ Memory added: {result['id']}")
            print(f"  Category: {result['category']}")
            print(f"  Created: {result['created']}")
            
        elif args.command == "search":
            results = client.search(args.query, limit=args.limit, category=args.category)
            if not results:
                print("No matching memories found.")
            else:
                print(f"Found {len(results)} result(s):\n")
                for i, r in enumerate(results, 1):
                    print(f"{i}. [{r['category']}] {r['text']}")
                    print(f"   Score: {r.get('score', 'N/A')}, Created: {r.get('created', 'N/A')}")
                    print()
                    
        elif args.command == "list":
            memories = client.list(category=args.category, limit=args.limit)
            if not memories:
                print("No memories stored yet.")
            else:
                print(f"Showing {len(memories)} of {client.stats()['total']} total:\n")
                for i, m in enumerate(memories, 1):
                    print(f"{i}. [{m['category']}] {m['text'][:80]}...")
                    print(f"   Created: {m.get('created', 'N/A')}")
                    print()
                    
        elif args.command == "stats":
            stats = client.stats()
            print(f"Memory Statistics:")
            print(f"  Total: {stats['total']}")
            print(f"  Embedder: {stats['embedder']}")
            print(f"  Model: {stats['model']}")
            print(f"  Storage: {stats['storage']}")
            print(f"\nCategories:")
            for cat, count in stats.get('categories', {}).items():
                print(f"  - {cat}: {count}")
                
        elif args.command == "clear":
            count = client.clear()
            print(f"✓ Cleared {count} memories")
            
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
