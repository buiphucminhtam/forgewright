#!/usr/bin/env python3
"""
Graphiti Client for Forgewright Memory

Temporal knowledge graph with FalkorDB + API-based LLM/Embeddings.
Supports: OpenAI, Anthropic, Gemini, MiniMax

Usage:
    from graphiti_client import GraphitiClient
    client = GraphitiClient()
    await client.add_memory("user request", metadata={"category": "conversation"})
    results = await client.search("memory system", time_filter=("2026-04-01", "2026-04-21"))
"""

import os
import re
import json
import hashlib
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass, field

# Graphiti core
try:
    from graphiti_core import Graphiti
    from graphiti_core.driver.neo4j_driver import Neo4jDriver
    from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient
    from graphiti_core.embedder.openai import OpenAIEmbedder
    from graphiti_core.embedder.openai import OpenAIEmbedderConfig
    from graphiti_core.llm_client.config import LLMConfig
    GRAPHITI_AVAILABLE = True
except ImportError:
    GRAPHITI_AVAILABLE = False
    print("⚠️ graphiti-core not installed. Run: pip install -r requirements-graphiti.txt")


# ── Constants ──

DEFAULT_GRAPH_NAME = "forgewright_memory"

# LLM Provider config (supports: openai, anthropic, gemini, minimax)
LLM_PROVIDER = os.environ.get("GRAPHITI_LLM_PROVIDER", "openai")
LLM_BASE_URL = os.environ.get("GRAPHITI_BASE_URL", "https://api.openai.com/v1")
LLM_API_KEY = os.environ.get("GRAPHITI_API_KEY", os.environ.get("OPENAI_API_KEY", ""))
DEFAULT_LLM_MODEL = os.environ.get("GRAPHITI_LLM_MODEL", "gpt-4o-mini")

# Embedding config
EMBED_PROVIDER = os.environ.get("GRAPHITI_EMBED_PROVIDER", "openai")
EMBED_API_KEY = os.environ.get("GRAPHITI_EMBED_API_KEY", os.environ.get("OPENAI_API_KEY", ""))
EMBED_BASE_URL = os.environ.get("GRAPHITI_EMBED_BASE_URL", "https://api.openai.com/v1")
DEFAULT_EMBED_MODEL = os.environ.get("GRAPHITI_EMBED_MODEL", "text-embedding-3-small")
EMBED_DIM = 1536  # text-embedding-3-small dimension

# Category weights (from mem0-cli)
CATEGORY_WEIGHTS = {
    "decisions": 10,
    "architecture": 8,
    "project": 8,
    "blockers": 7,
    "session": 6,
    "tasks": 5,
    "conversation": 4,
    "general": 4,
    "git-activity": 3,
    "ingested": 2,
}

# Secret redaction patterns
REDACT_PATTERNS = [
    r"sk-[a-zA-Z0-9]{20,}",
    r"key-[a-zA-Z0-9]{20,}",
    r"Bearer\s+[a-zA-Z0-9\-._~+/]+=*",
    r"(?i)password\s*[:=]\s*['\"]?[^\s'\"]{4,}",
    r"(?i)secret\s*[:=]\s*['\"]?[^\s'\"]{4,}",
]


# ── Dataclasses ──

@dataclass
class TimeFilter:
    """Temporal filter for queries."""
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
        }


@dataclass
class MemoryResult:
    """Result from memory search."""
    id: str
    text: str
    category: str
    source: str
    created: datetime
    entities: List[str] = field(default_factory=list)
    relations: List[Dict] = field(default_factory=list)
    score: float = 0.0


# ── Temporal Query Parser ──

class TemporalQueryParser:
    """Parse natural language time expressions."""
    
    PATTERNS = [
        # "YYYY-MM" format - must match BEFORE month name (more specific)
        (r"(\d{4})-(\d{2})(?!-)", lambda m: _parse_year_month(m.group(1), m.group(2))),
        
        # "last N days/weeks/months"
        (r"last\s+(\d+)\s+days?", lambda m: (datetime.now() - timedelta(days=int(m.group(1))), datetime.now())),
        (r"last\s+(\d+)\s+weeks?", lambda m: (datetime.now() - timedelta(weeks=int(m.group(1))), datetime.now())),
        (r"last\s+(\d+)\s+months?", lambda m: (datetime.now() - timedelta(days=int(m.group(1)) * 30), datetime.now())),
        
        # "last week/month/year"
        (r"last\s+week", lambda _: (datetime.now() - timedelta(weeks=1), datetime.now())),
        (r"last\s+month", lambda _: (datetime.now() - timedelta(days=30), datetime.now())),
        (r"last\s+year", lambda _: (datetime.now() - timedelta(days=365), datetime.now())),
        
        # "in Month YYYY" - must match after YYYY-MM
        (r"in\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})", 
         lambda m: _parse_month_year(m.group(1), m.group(2))),
    ]
    
    @classmethod
    def parse(cls, time_expr: str) -> TimeFilter:
        """Parse time expression to TimeFilter."""
        time_expr = time_expr.lower().strip()
        
        for pattern, handler in cls.PATTERNS:
            m = re.search(pattern, time_expr, re.IGNORECASE)
            if m:
                start, end = handler(m)
                return TimeFilter(start_date=start, end_date=end)
        
        # Default: last 7 days
        return TimeFilter(start_date=datetime.now() - timedelta(days=7), end_date=datetime.now())


def _parse_month_year(month: str, year: str) -> Tuple[datetime, datetime]:
    """Parse 'month year' to date range."""
    months = {
        "january": 1, "february": 2, "march": 3, "april": 4,
        "may": 5, "june": 6, "july": 7, "august": 8,
        "september": 9, "october": 10, "november": 11, "december": 12
    }
    month_num = months.get(month.lower(), 1)
    year_num = int(year)
    
    start = datetime(year_num, month_num, 1)
    # End of month
    if month_num == 12:
        end = datetime(year_num + 1, 1, 1) - timedelta(seconds=1)
    else:
        end = datetime(year_num, month_num + 1, 1) - timedelta(seconds=1)
    
    return start, end


def _parse_year_month(year: str, month: str) -> Tuple[datetime, datetime]:
    """Parse 'YYYY-MM' to date range."""
    month_num = int(month)
    year_num = int(year)
    
    start = datetime(year_num, month_num, 1)
    # End of month
    if month_num == 12:
        end = datetime(year_num + 1, 1, 1) - timedelta(seconds=1)
    else:
        end = datetime(year_num, month_num + 1, 1) - timedelta(seconds=1)
    
    return start, end


# ── Graphiti Client ──

class GraphitiClient:
    """
    Temporal knowledge graph client for Forgewright memory.
    
    Uses Graphiti + FalkorDB + Ollama for fully local operation.
    """
    
    def __init__(
        self,
        graph_name: str = DEFAULT_GRAPH_NAME,
        llm_model: str = DEFAULT_LLM_MODEL,
        embed_model: str = DEFAULT_EMBED_MODEL,
    ):
        self.graph_name = graph_name
        self.llm_model = llm_model
        self.embed_model = embed_model
        self._graphiti: Optional[Graphiti] = None
        self._episodes_cache: Dict[str, Any] = {}
        
    @property
    def graphiti(self) -> Graphiti:
        """Lazy initialization of Graphiti instance."""
        if self._graphiti is None:
            self._graphiti = self._create_graphiti()
        return self._graphiti
    
    def _create_graphiti(self) -> Graphiti:
        """Create Graphiti instance with API LLM + FalkorDB."""
        if not GRAPHITI_AVAILABLE:
            raise RuntimeError(
                "Graphiti not available. Install: pip install -r requirements-graphiti.txt"
            )
        
        # Neo4j driver
        driver = Neo4jDriver(
            uri=os.environ.get("NEO4J_URI", "bolt://localhost:7687"),
            user=os.environ.get("NEO4J_USER", "neo4j"),
            password=os.environ.get("NEO4J_PASSWORD", "neo4j"),
        )
        
        # LLM config (API-based, OpenAI-compatible)
        llm_config = LLMConfig(
            api_key=LLM_API_KEY,
            model=self.llm_model,
            small_model=self.llm_model,
            base_url=LLM_BASE_URL,
        )
        llm_client = OpenAIGenericClient(config=llm_config)
        
        # Embedder config (API-based, OpenAI-compatible)
        embedder = OpenAIEmbedder(
            config=OpenAIEmbedderConfig(
                api_key=EMBED_API_KEY,
                embedding_model=self.embed_model,
                embedding_dim=EMBED_DIM,
                base_url=EMBED_BASE_URL,
            )
        )
        
        return Graphiti(
            graph_driver=driver,
            llm_client=llm_client,
            embedder=embedder,
        )
    
    def _redact_secrets(self, text: str) -> str:
        """Remove secrets from text."""
        if os.environ.get("GRAPHITI_REDACT_SECRETS", "true").lower() != "true":
            return text
        for pattern in REDACT_PATTERNS:
            text = re.sub(pattern, "[REDACTED]", text)
        return text
    
    def _make_id(self, text: str) -> str:
        """Generate short deterministic ID."""
        return hashlib.sha256(text.encode()).hexdigest()[:12]
    
    # ── Core Operations ──
    
    async def add_memory(
        self,
        text: str,
        category: str = "general",
        source: str = "cli",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Add memory to the temporal knowledge graph.
        
        Creates an Episode and extracts entities/relations automatically.
        """
        text = self._redact_secrets(text)
        
        # Create episode for this memory
        episode_name = f"{source}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        episode = await self.graphiti.add_episode(
            name=episode_name,
            date=datetime.now(),
            summary=text[:200],  # First 200 chars as summary
            source=source,
            categories=[category],
        )
        
        # Add fact to episode (LLM extracts entities/relations)
        fact = await self.graphiti.add_fact(
            episode=episode,
            fact_body=text,
            fact_categories=[category],
        )
        
        # Store in cache for quick access
        memory_id = self._make_id(text + datetime.now().isoformat())
        
        result = {
            "id": memory_id,
            "text": text,
            "category": category,
            "source": source,
            "created": datetime.now().isoformat(timespec="seconds"),
            "episode_id": episode.uuid if hasattr(episode, 'uuid') else str(episode),
            "fact_id": fact.uuid if hasattr(fact, 'uuid') else str(fact),
        }
        
        if metadata:
            result["metadata"] = metadata
        
        self._episodes_cache[memory_id] = result
        return result
    
    async def search(
        self,
        query: str,
        limit: int = 5,
        time_filter: Optional[TimeFilter] = None,
        categories: Optional[List[str]] = None,
    ) -> List[MemoryResult]:
        """
        Search memories with semantic similarity and optional temporal filter.
        """
        # Build time filter dict for Graphiti
        time_filter_dict = None
        if time_filter:
            time_filter_dict = time_filter.to_dict()
        
        # Search Graphiti
        results = await self.graphiti.search(
            query=query,
            limit=limit,
            time_filter=time_filter_dict,
            categories=categories,
        )
        
        memory_results = []
        for r in results:
            memory_results.append(MemoryResult(
                id=r.get("uuid", self._make_id(r.get("body", ""))),
                text=r.get("body", ""),
                category=r.get("categories", ["general"])[0] if r.get("categories") else "general",
                source=r.get("source", "unknown"),
                created=datetime.fromisoformat(r.get("created_at", datetime.now().isoformat())),
                entities=r.get("entities", []),
                relations=r.get("relations", []),
                score=r.get("score", 0.0),
            ))
        
        return memory_results
    
    async def get_entity_history(
        self,
        entity_name: str,
        include_relations: bool = True,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        Get temporal history of an entity.
        
        Returns all facts involving this entity, ordered by time.
        """
        # Search for entity mentions
        results = await self.graphiti.search(
            query=entity_name,
            limit=limit,
        )
        
        # Filter to facts mentioning this entity
        entity_history = []
        for r in results:
            entities = r.get("entities", [])
            if any(entity_name.lower() in e.lower() for e in entities):
                entity_history.append({
                    "text": r.get("body", ""),
                    "created": r.get("created_at", ""),
                    "entities": entities,
                    "relations": r.get("relations", []) if include_relations else [],
                    "source": r.get("source", "unknown"),
                })
        
        # Sort by date
        entity_history.sort(key=lambda x: x.get("created", ""), reverse=True)
        return entity_history
    
    async def list_memories(
        self,
        category: Optional[str] = None,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        List all memories, optionally filtered by category.
        """
        # Get recent episodes
        episodes = await self.graphiti.get_recent_episodes(limit=limit)
        
        memories = []
        for ep in episodes:
            facts = await self.graphiti.get_episode_facts(ep)
            for fact in facts:
                if category and category not in fact.get("categories", []):
                    continue
                memories.append({
                    "id": self._make_id(fact.get("body", "")),
                    "text": fact.get("body", ""),
                    "category": fact.get("categories", ["general"])[0],
                    "source": fact.get("source", "unknown"),
                    "created": fact.get("created_at", ""),
                })
        
        return memories[:limit]
    
    async def stats(self) -> Dict[str, Any]:
        """Get graph statistics."""
        try:
            # Get entity and fact counts
            episodes = await self.graphiti.get_recent_episodes(limit=1000)
            total_episodes = len(episodes)
            
            total_facts = 0
            categories = {}
            for ep in episodes:
                facts = await self.graphiti.get_episode_facts(ep)
                total_facts += len(facts)
                for f in facts:
                    cat = f.get("categories", ["general"])[0]
                    categories[cat] = categories.get(cat, 0) + 1
            
            return {
                "total_episodes": total_episodes,
                "total_facts": total_facts,
                "categories": categories,
                "graph_name": self.graph_name,
            }
        except Exception as e:
            return {
                "error": str(e),
                "graph_name": self.graph_name,
            }
    
    async def gc(self, max_episodes: int = 100) -> int:
        """
        Garbage collect old episodes.
        
        Keeps recent episodes and removes oldest.
        """
        try:
            episodes = await self.graphiti.get_recent_episodes(limit=1000)
            
            if len(episodes) <= max_episodes:
                return 0
            
            # Remove oldest episodes
            removed = 0
            for ep in episodes[max_episodes:]:
                try:
                    await self.graphiti.delete_episode(ep)
                    removed += 1
                except Exception:
                    pass
            
            return removed
        except Exception as e:
            print(f"GC error: {e}")
            return 0
    
    async def close(self):
        """Close connections."""
        if self._graphiti:
            await self._graphiti.close()
            self._graphiti = None


# ── Sync Wrapper ──

class SyncGraphitiClient:
    """
    Synchronous wrapper for GraphitiClient.
    
    For use in CLI scripts without async/await.
    """
    
    def __init__(self, **kwargs):
        self._client = GraphitiClient(**kwargs)
        self._loop = None
    
    def _ensure_loop(self):
        """Ensure async loop is running."""
        if self._loop is None:
            import asyncio
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
        return self._loop
    
    def add_memory(self, *args, **kwargs) -> Dict[str, Any]:
        loop = self._ensure_loop()
        return loop.run_until_complete(self._client.add_memory(*args, **kwargs))
    
    def search(self, *args, **kwargs) -> List[MemoryResult]:
        loop = self._ensure_loop()
        return loop.run_until_complete(self._client.search(*args, **kwargs))
    
    def get_entity_history(self, *args, **kwargs) -> List[Dict[str, Any]]:
        loop = self._ensure_loop()
        return loop.run_until_complete(self._client.get_entity_history(*args, **kwargs))
    
    def list_memories(self, *args, **kwargs) -> List[Dict[str, Any]]:
        loop = self._ensure_loop()
        return loop.run_until_complete(self._client.list_memories(*args, **kwargs))
    
    def stats(self) -> Dict[str, Any]:
        loop = self._ensure_loop()
        return loop.run_until_complete(self._client.stats())
    
    def gc(self, *args, **kwargs) -> int:
        loop = self._ensure_loop()
        return loop.run_until_complete(self._client.gc(*args, **kwargs))


# ── Factory ──

def create_client(**kwargs) -> SyncGraphitiClient:
    """Create synchronous Graphiti client."""
    return SyncGraphitiClient(**kwargs)
