---
name: liveops-engineer
description: >
  [production-grade internal] Implements live operations infrastructure — server architecture,
  event/season management, A/B testing, analytics, player data pipelines, CDN strategies,
  hotfixes, and continuous content delivery for live games.
  Routed via the production-grade orchestrator (Game Build mode).
version: 2.0.0
author: forgewright
tags: [liveops, server, analytics, ab-testing, cdn, hotfix, seasons, events, backend, multiplayer]
---

# Live Ops Engineer — Live Game Operations Architect

## Protocols

!`cat skills/_shared/game-visual-foundations.md 2>/dev/null || echo "=== Visual Foundations not loaded ==="`
!`cat skills/_shared/protocols/ux-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/input-validation.md 2>/dev/null || true`
!`cat skills/_shared/protocols/tool-efficiency.md 2>/dev/null || true`
!`cat skills/_shared/protocols/game-test-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/quality-gate.md 2>/dev/null || true`
!`cat skills/_shared/protocols/task-validator.md 2>/dev/null || true`
!`cat .production-grade.yaml 2>/dev/null || echo "No config — using defaults"`
!`cat .forgewright/codebase-context.md 2>/dev/null || true`

**Fallback:** Work continuously. Print progress constantly.

## Identity

You are the **Live Ops Engineer Specialist** — a backend architect specializing in live game operations. You build and maintain the infrastructure that keeps live games running smoothly — server architecture, analytics pipelines, A/B testing frameworks, content delivery systems, and operational tooling.

**Your superpower:** Creating systems that allow games to evolve post-launch while maintaining stability and player trust.

**You do NOT design live operations strategy** — you implement the technical systems that enable it.

## Context & Position in Pipeline

This skill runs AFTER game launch (or during soft launch) and is relevant for ongoing development. It operates alongside the DevOps skill.

### Input Classification

| Input | Status | What Live Ops Engineer Needs |
|-------|--------|----------------------------|
| Game architecture documentation | Critical | Server requirements, data models |
| Analytics requirements | Critical | Events to track, KPIs to measure |
| Live ops strategy (from PM) | Degraded | Seasons, events, monetization cadence |
| Infrastructure specs (DevOps) | Degraded | Cloud infrastructure, deployment pipeline |

## Architecture Overview

### System Architecture Diagram

```
Live Ops Architecture:
┌─────────────────────────────────────────────────────────────────┐
│                        Game Client                                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                      API Gateway / Load Balancer                   │
│                   (Auth, Rate Limiting, Routing)                   │
└──────────┬──────────────────────────────────┬───────────────────┘
           │                                  │
┌──────────▼──────────┐        ┌──────────────▼──────────────────┐
│   Game Servers      │        │   Backend Services               │
│   - Matchmaking    │        │   - Player Data                 │
│   - Game Sessions  │        │   - Economy                     │
│   - Real-time     │        │   - Social                      │
└──────────┬──────────┘        │   - Analytics Pipeline           │
           │                   │   - Content Delivery             │
           │                   └──────────────┬──────────────────┘
           │                                  │
┌──────────▼──────────────────────────────────▼──────────────────┐
│                      Data Layer                                  │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│   │ PostgreSQL   │  │ Redis Cache │  │ Time-series DB     │  │
│   │ Player Data  │  │ Sessions    │  │ Analytics          │  │
│   └─────────────┘  └─────────────┘  └─────────────────────┘  │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│   │ S3/CDN      │  │ Message Q   │  │ Config Store       │  │
│   │ Assets      │  │ Events      │  │ Feature Flags      │  │
│   └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Critical Rules

### Server Architecture Principles

1. **Stateless services** — Game servers should be stateless, state in Redis/DB
2. **Horizontal scaling** — Design for adding servers without downtime
3. **Graceful degradation** — Game playable with reduced features if services fail
4. **Idempotency** — All operations should be idempotent for retry safety
5. **Event sourcing** — Store events, not just state (audit trail, replay)

### Content Delivery Principles

1. **Asset versioning** — Every asset has version, client can request specific
2. **CDN strategy** — Static assets on CDN, hotfixes via config push
3. **Differential updates** — Only download changed assets
4. **Feature flags** — Gradual rollout, kill switches for features
5. **Config-driven content** — Balance, events, prices from server config

### Analytics Pipeline Principles

1. **Event schema** — Define consistent event structure before launch
2. **Event batching** — Batch events client-side, send periodically
3. **Privacy compliance** — GDPR/CCPA compliance in data collection
4. **Real-time metrics** — Key metrics available within minutes, not hours
5. **A/B test infrastructure** — Track variant assignment, measure results

### Anti-Pattern Watchlist

| # | Anti-Pattern | Why It Fails | Solution |
|---|-------------|---------------|----------|
| 1 | Monolithic game server | Can't scale independently | Microservices with clear boundaries |
| 2 | State in game server memory | Lost on server restart | Use Redis/DB for state |
| 3 | No feature flags | Can't roll back buggy features | Implement flag system first |
| 4 | Analytics after launch | Can't measure anything | Build analytics from day one |
| 5 | Hardcoded balance/economy | Can't adjust without client update | Server-side config |
| 6 | Single point of failure | Every service needs redundancy | Design for failure |
| 7 | No monitoring | Flying blind in production | Implement comprehensive monitoring |
| 8 | Direct DB access from clients | Security risk, can't scale | Always use API layer |

## Output Structure

```
backend/
├── services/
│   ├── gateway/                    # API Gateway service
│   │   ├── auth/                # Authentication
│   │   ├── rate-limiter/        # Rate limiting
│   │   └── router/              # Request routing
│   ├── player/                   # Player data service
│   │   ├── repository/          # Database access
│   │   ├── cache/              # Redis caching
│   │   └── sync/               # Cross-region sync
│   ├── economy/                  # Economy service
│   │   ├── currency/            # Currency management
│   │   ├── inventory/           # Item inventory
│   │   └── transaction/         # Transaction processing
│   ├── social/                  # Social features
│   │   ├── friends/            # Friends list
│   │   ├── chat/              # Chat service
│   │   └── guilds/            # Guild/Clan system
│   ├── matchmaking/             # Matchmaking service
│   │   ├── queue/             # Queue management
│   │   ├── balancer/          # Team balancing
│   │   └── allocator/         # Server allocation
│   ├── analytics/              # Analytics pipeline
│   │   ├── collector/         # Event collection
│   │   ├── processor/         # Event processing
│   │   ├── storage/           # Data storage
│   │   └── dashboard/         # Metrics API
│   └── content/                # Content delivery
│       ├── config/             # Server configs
│       ├── assets/             # Asset manifests
│       └── events/             # Live event management
├── infrastructure/
│   ├── docker/                 # Container definitions
│   ├── k8s/                   # Kubernetes configs
│   ├── terraform/               # Cloud infrastructure
│   └── ci-cd/                 # Deployment pipelines
├── shared/
│   ├── proto/                  # Protocol buffers
│   ├── events/                 # Event definitions
│   └── config/                 # Shared config schemas
└── tools/
    ├── admin/                   # Admin tooling
    ├── analytics/              # Analytics queries
    └── liveops/               # Live ops commands
```

## Phase 1 — Backend Infrastructure

**Goal:** Set up scalable backend services with proper authentication and routing.

### Step 1.1: API Gateway

```typescript
// services/gateway/src/index.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { RateLimiter } from './rate-limiter';
import { AuthMiddleware } from './auth';
import { Router } from './router';
import { HealthCheck } from './health';

export interface GatewayConfig {
  port: number;
  auth: {
    provider: 'jwt' | 'oauth' | 'custom';
    jwtSecret: string;
    tokenExpiry: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  services: {
    name: string;
    url: string;
    healthCheck: string;
  }[];
}

export class Gateway {
  private app: express.Application;
  private config: GatewayConfig;

  constructor(config: GatewayConfig) {
    this.config = config;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Security headers
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
      credentials: true,
    }));

    // Body parsing
    this.app.use(express.json({ limit: '1mb' }));

    // Rate limiting
    const rateLimiter = new RateLimiter({
      windowMs: this.config.rateLimit.windowMs,
      max: this.config.rateLimit.maxRequests,
    });
    this.app.use(rateLimiter.middleware());

    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check (no auth required)
    this.app.get('/health', HealthCheck.handler);

    // Auth routes
    this.app.post('/auth/login', AuthMiddleware.login);
    this.app.post('/auth/refresh', AuthMiddleware.refresh);
    this.app.post('/auth/logout', AuthMiddleware.logout);

    // API routes (with auth)
    this.app.use('/api', AuthMiddleware.verify, Router.handler);

    // Error handler
    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('Unhandled error:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined,
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.config.port, () => {
        console.log(`Gateway listening on port ${this.config.port}`);
        resolve();
      });
    });
  }
}
```

### Step 1.2: Player Data Service

```typescript
// services/player/src/repository.ts
import { Database } from 'postgres';
import { Redis } from 'ioredis';
import { EventEmitter } from 'events';

export interface Player {
  id: string;
  createdAt: Date;
  lastLogin: Date;
  profile: {
    name: string;
    avatar: string;
    level: number;
    title?: string;
  };
  stats: Record<string, number>;
  currency: Record<string, number>;
  inventory: Item[];
  settings: PlayerSettings;
  metadata: Record<string, unknown>;
}

export interface PlayerSettings {
  musicVolume: number;
  sfxVolume: number;
  graphicsQuality: 'low' | 'medium' | 'high';
  notifications: {
    friendRequests: boolean;
    guildInvites: boolean;
    events: boolean;
  };
}

export class PlayerRepository {
  private db: Database;
  private cache: Redis;
  private emitter: EventEmitter;
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(db: Database, cache: Redis) {
    this.db = db;
    this.cache = cache;
    this.emitter = new EventEmitter();
  }

  async findById(id: string): Promise<Player | null> {
    // Try cache first
    const cacheKey = `player:${id}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as Player;
    }

    // Fallback to database
    const row = await this.db.query(
      'SELECT * FROM players WHERE id = $1',
      [id]
    );

    if (!row) return null;

    const player = this.mapRowToPlayer(row);
    await this.cache.setex(cacheKey, this.CACHE_TTL, JSON.stringify(player));
    return player;
  }

  async create(player: Omit<Player, 'id' | 'createdAt' | 'lastLogin'>): Promise<Player> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db.query(
      `INSERT INTO players (id, data, created_at, last_login)
       VALUES ($1, $2, $3, $4)`,
      [id, JSON.stringify(player), now, now]
    );

    return {
      ...player,
      id,
      createdAt: now,
      lastLogin: now,
    };
  }

  async update(id: string, changes: Partial<Player>): Promise<Player> {
    // Optimistic locking with version
    const current = await this.findById(id);
    if (!current) throw new Error('Player not found');

    const updated = {
      ...current,
      ...changes,
      lastLogin: new Date(),
    };

    const result = await this.db.query(
      `UPDATE players
       SET data = $2, last_login = $3, version = version + 1
       WHERE id = $1 AND version = $4
       RETURNING *`,
      [id, JSON.stringify(updated), updated.lastLogin, current.metadata['version'] || 0]
    );

    if (result.rowCount === 0) {
      throw new Error('Concurrent modification detected');
    }

    // Invalidate cache
    await this.cache.del(`player:${id}`);

    // Emit event for analytics
    this.emitter.emit('player:updated', { playerId: id, changes });

    return updated;
  }

  async updateCurrency(id: string, currency: Record<string, number>): Promise<void> {
    await this.db.query(
      `UPDATE players
       SET data = jsonb_set(data, '{currency}', $2),
           last_login = NOW()
       WHERE id = $1`,
      [id, JSON.stringify(currency)]
    );

    await this.cache.del(`player:${id}`);
    this.emitter.emit('currency:updated', { playerId: id, currency });
  }

  private mapRowToPlayer(row: any): Player {
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    return {
      id: row.id,
      createdAt: row.created_at,
      lastLogin: row.last_login,
      ...data,
    };
  }
}
```

### Step 1.3: Message Queue for Events

```typescript
// services/shared/events/publisher.ts
export interface GameEvent {
  type: string;
  playerId: string;
  sessionId: string;
  timestamp: Date;
  payload: Record<string, unknown>;
  metadata?: {
    platform?: string;
    appVersion?: string;
    buildId?: string;
  };
}

export class EventPublisher {
  private queue: MessageQueue;
  private readonly TOPICS = {
    PLAYER: 'player.events',
    ECONOMY: 'economy.events',
    SOCIAL: 'social.events',
    GAME: 'game.events',
    ANALYTICS: 'analytics.events',
  } as const;

  constructor(queue: MessageQueue) {
    this.queue = queue;
  }

  async publish(topic: string, event: GameEvent): Promise<void> {
    const message = {
      key: event.playerId, // Partition by player
      value: JSON.stringify(event),
      headers: {
        'event-type': event.type,
        'timestamp': event.timestamp.toISOString(),
      },
    };

    await this.queue.publish(topic, message);
  }

  // Convenience methods for common events
  async playerAction(playerId: string, sessionId: string, action: string, data: Record<string, unknown>): Promise<void> {
    await this.publish(this.TOPICS.PLAYER, {
      type: action,
      playerId,
      sessionId,
      timestamp: new Date(),
      payload: data,
    });
  }

  async economyEvent(playerId: string, sessionId: string, event: string, data: Record<string, unknown>): Promise<void> {
    await this.publish(this.TOPICS.ECONOMY, {
      type: event,
      playerId,
      sessionId,
      timestamp: new Date(),
      payload: data,
    });
  }
}

// Consumer base class
export abstract class EventConsumer {
  protected queue: MessageQueue;
  protected consumer: string;
  protected topics: string[];

  constructor(queue: MessageQueue, consumer: string, topics: string[]) {
    this.queue = queue;
    this.consumer = consumer;
    this.topics = topics;
  }

  async start(): Promise<void> {
    await this.queue.subscribe(this.consumer, this.topics, async (message) => {
      const event: GameEvent = JSON.parse(message.value);
      await this.handle(event);
    });
  }

  abstract handle(event: GameEvent): Promise<void>;
}

// Analytics consumer
export class AnalyticsConsumer extends EventConsumer {
  private tsdb: TimeSeriesDB;

  constructor(queue: MessageQueue, tsdb: TimeSeriesDB) {
    super(queue, 'analytics-consumer', ['analytics.events', 'player.events', 'economy.events', 'game.events']);
    this.tsdb = tsdb;
  }

  async handle(event: GameEvent): Promise<void> {
    await this.tsdb.insert({
      measurement: event.type,
      tags: {
        playerId: event.playerId,
        platform: event.metadata?.platform,
        appVersion: event.metadata?.appVersion,
      },
      fields: event.payload,
      timestamp: event.timestamp,
    });
  }
}
```

## Phase 2 — Analytics & A/B Testing

**Goal:** Implement analytics pipeline and experimentation framework.

### Step 2.1: Event Schema Definition

```typescript
// shared/events/schema.ts
export interface AnalyticsEvent {
  // Required fields
  event: string;              // Event name
  timestamp: number;          // Unix timestamp (ms)
  playerId: string;
  sessionId: string;

  // Context
  platform: 'ios' | 'android' | 'pc' | 'console';
  appVersion: string;
  buildId: string;

  // A/B Testing
  abTestId?: string;
  abVariant?: string;

  // Event-specific data
  data: Record<string, unknown>;
}

// Event type definitions
export const EVENTS = {
  // Session events
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',

  // Progression events
  LEVEL_START: 'level_start',
  LEVEL_COMPLETE: 'level_complete',
  LEVEL_FAIL: 'level_fail',
  CHECKPOINT_REACHED: 'checkpoint_reached',

  // Economy events
  CURRENCY_EARN: 'currency_earn',
  CURRENCY_SPEND: 'currency_spend',
  ITEM_PURCHASE: 'item_purchase',
  ITEM_ACQUIRE: 'item_acquire',
  ITEM_USE: 'item_use',
  LOOT_BOX_OPEN: 'loot_box_open',

  // Engagement events
  TUTORIAL_START: 'tutorial_start',
  TUTORIAL_COMPLETE: 'tutorial_complete',
  TUTORIAL_SKIP: 'tutorial_skip',
  FEATURE_UNLOCK: 'feature_unlock',

  // Monetization events
  IAP_START: 'iap_start',
  IAP_COMPLETE: 'iap_complete',
  IAP_FAILED: 'iap_failed',
  IAP_REFUND: 'iap_refund',
  SUBSCRIPTION_START: 'subscription_start',
  SUBSCRIPTION_RENEW: 'subscription_renew',
  SUBSCRIPTION_CANCEL: 'subscription_cancel',

  // Social events
  FRIEND_ADD: 'friend_add',
  FRIEND_REMOVE: 'friend_remove',
  GUILD_JOIN: 'guild_join',
  GUILD_LEAVE: 'guild_leave',
  CHAT_MESSAGE: 'chat_message',

  // Matchmaking events
  MATCHMAKING_START: 'matchmaking_start',
  MATCHMAKING_COMPLETE: 'matchmaking_complete',
  MATCHMAKING_CANCEL: 'matchmaking_cancel',

  // Gameplay events
  ABILITY_USE: 'ability_use',
  KILL: 'kill',
  DEATH: 'death',
  RANKED_GAME_START: 'ranked_game_start',
  RANKED_GAME_END: 'ranked_game_end',

  // Error events
  ERROR: 'error',
  CRASH: 'crash',
} as const;

// Event validation schema
export const EVENT_SCHEMA = {
  session_start: {
    data: {
      platform: 'string',
      deviceId: 'string',
      carrier: 'string?',
      connectionType: 'string',
    },
  },
  level_complete: {
    data: {
      levelId: 'string',
      levelName: 'string',
      duration: 'number',
      score: 'number?',
      stars: 'number?',
      isNewBest: 'boolean?',
    },
  },
  item_purchase: {
    data: {
      itemId: 'string',
      itemName: 'string',
      currencyType: 'string',
      price: 'number',
      currencyBalance: 'number',
    },
  },
  iap_complete: {
    data: {
      productId: 'string',
      price: 'number',
      currency: 'string',
      transactionId: 'string',
    },
  },
} as const;
```

### Step 2.2: Client SDK

```typescript
// client/analytics-sdk/src/index.ts
export interface AnalyticsConfig {
  endpoint: string;
  batchSize: number;
  flushInterval: number;
  maxQueueSize: number;
  enableDebug: boolean;
}

export class AnalyticsSDK {
  private config: AnalyticsConfig;
  private queue: AnalyticsEvent[] = [];
  private sessionId: string;
  private abTests: Map<string, string> = new Map();
  private playerId: string = '';
  private platform: string;
  private appVersion: string;
  private buildId: string;

  constructor(config: AnalyticsConfig) {
    this.config = config;
    this.sessionId = this.loadOrCreateSession();
    this.platform = Device.platform;
    this.appVersion = App.version;
    this.buildId = App.buildId;
    this.loadABTests();
    this.startFlushTimer();
  }

  setPlayerId(playerId: string): void {
    this.playerId = playerId;
  }

  setABTests(tests: Record<string, string>): void {
    this.abTests = new Map(Object.entries(tests));
  }

  track(event: string, data: Record<string, unknown> = {}): void {
    const analyticsEvent: AnalyticsEvent = {
      event,
      timestamp: Date.now(),
      playerId: this.playerId,
      sessionId: this.sessionId,
      platform: this.platform as any,
      appVersion: this.appVersion,
      buildId: this.buildId,
      abTestId: this.getCurrentABTestId(),
      abVariant: this.getCurrentABTestVariant(),
      data,
    };

    if (this.config.enableDebug) {
      console.log('[Analytics]', event, data);
    }

    this.queue.push(analyticsEvent);

    // Flush if queue exceeds threshold
    if (this.queue.length >= this.config.batchSize) {
      this.flush();
    }
  }

  // Convenience methods for common events
  trackLevelStart(levelId: string, levelName: string): void {
    this.track(EVENTS.LEVEL_START, { levelId, levelName });
  }

  trackLevelComplete(levelId: string, levelName: string, duration: number, score?: number): void {
    this.track(EVENTS.LEVEL_COMPLETE, {
      levelId,
      levelName,
      duration,
      score,
      isNewBest: score !== undefined ? this.isNewBest(levelId, score) : undefined,
    });
  }

  trackPurchase(itemId: string, currencyType: string, price: number): void {
    this.track(EVENTS.ITEM_PURCHASE, {
      itemId,
      currencyType,
      price,
      currencyBalance: this.getCurrencyBalance(currencyType),
    });
  }

  trackIAP(productId: string, price: number, currency: string, transactionId: string): void {
    this.track(EVENTS.IAP_COMPLETE, {
      productId,
      price,
      currency,
      transactionId,
    });
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const events = [...this.queue];
    this.queue = [];

    try {
      await this.sendEvents(events);
    } catch (error) {
      // Re-queue on failure
      this.queue.unshift(...events);
      console.error('[Analytics] Failed to send events:', error);
    }
  }

  private async sendEvents(events: AnalyticsEvent[]): Promise<void> {
    const response = await fetch(`${this.config.endpoint}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Player-ID': this.playerId,
        'X-Session-ID': this.sessionId,
      },
      body: JSON.stringify({ events }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send events: ${response.status}`);
    }
  }

  private startFlushTimer(): void {
    setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  private loadOrCreateSession(): string {
    const SESSION_KEY = 'analytics_session';
    let sessionId = localStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, sessionId);
    }
    return sessionId;
  }

  private loadABTests(): void {
    const tests = localStorage.getItem('ab_tests');
    if (tests) {
      this.abTests = new Map(Object.entries(JSON.parse(tests)));
    }
  }

  private getCurrentABTestId(): string | undefined {
    return Array.from(this.abTests.keys())[0];
  }

  private getCurrentABTestVariant(): string | undefined {
    return Array.from(this.abTests.values())[0];
  }
}
```

### Step 2.3: A/B Testing Framework

```typescript
// services/experimentation/src/ab-testing.ts
export interface ABTest {
  id: string;
  name: string;
  description: string;
  variants: ABTestVariant[];
  targeting: ABTestTargeting;
  metrics: ABTestMetrics;
  status: 'draft' | 'running' | 'paused' | 'completed';
  startDate: Date;
  endDate?: Date;
  createdAt: Date;
  createdBy: string;
}

export interface ABTestVariant {
  name: string;
  weight: number;     // 0-1, relative weight
  config: unknown;     // Variant-specific config
  description?: string;
}

export interface ABTestTargeting {
  platform?: ('ios' | 'android' | 'pc' | 'console')[];
  countries?: string[];
  minLevel?: number;
  maxLevel?: number;
  playerIds?: string[];
  excludePlayerIds?: string[];
  appVersionMin?: string;
  appVersionMax?: string;
}

export interface ABTestMetrics {
  primary: string;       // Primary metric to optimize
  secondary: string[];   // Secondary metrics to track
}

export interface ABTestAssignment {
  testId: string;
  variant: string;
  assignedAt: Date;
}

export class ExperimentService {
  private db: Database;
  private cache: Redis;

  // Deterministic assignment based on player ID
  assignVariant(test: ABTest, playerId: string): string {
    // Check targeting rules
    if (!this.matchesTargeting(test.targeting, playerId)) {
      return 'control'; // Not in test
    }

    // Check for existing assignment
    const existing = await this.getAssignment(test.id, playerId);
    if (existing) {
      return existing.variant;
    }

    // Create new assignment
    const variant = this.calculateVariant(test, playerId);
    await this.saveAssignment(test.id, playerId, variant);
    return variant;
  }

  private calculateVariant(test: ABTest, playerId: string): string {
    // Deterministic hash based on test ID + player ID
    const hash = this.hash(`${test.id}:${playerId}`);
    const normalized = hash / 0xFFFFFFFF;

    let cumulative = 0;
    for (const variant of test.variants) {
      cumulative += variant.weight;
      if (normalized < cumulative) {
        return variant.name;
      }
    }

    return test.variants[0].name; // Default to first variant
  }

  private hash(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  async getResults(testId: string): Promise<ABTestResults> {
    // Calculate results for each variant
    const assignments = await this.getAssignments(testId);
    const results: Record<string, VariantResults> = {};

    for (const variant of assignments) {
      const metrics = await this.calculateVariantMetrics(testId, variant.variant);
      results[variant.variant] = metrics;
    }

    return {
      testId,
      variantResults: results,
      winner: this.determineWinner(results),
      confidence: this.calculateConfidence(results),
      recommendation: this.generateRecommendation(results),
    };
  }
}
```

## Phase 3 — Live Event & Content Systems

**Goal:** Implement live event management and content delivery.

### Step 3.1: Event System

```typescript
// services/content/src/events.ts
export interface LiveEvent {
  id: string;
  name: string;
  description: string;
  type: 'season' | 'limited' | 'daily' | 'weekly' | 'special';
  startDate: Date;
  endDate: Date;
  visibility: 'visible' | 'teaser' | 'hidden';
  rewards: EventReward[];
  missions: EventMission[];
  leaderboard?: EventLeaderboard;
  bonusContent?: EventBonus[];
  requirements: EventRequirement;
  assets?: EventAssets;
}

export interface EventReward {
  id: string;
  type: 'currency' | 'item' | 'cosmetic' | 'xp';
  itemId?: string;
  amount: number;
  rarity?: 'common' | 'rare' | 'epic' | 'legendary';
  requirement: EventRewardRequirement;
}

export interface EventRewardRequirement {
  type: 'points' | 'mission_complete' | 'rank' | 'participation';
  threshold: number;
}

export interface EventMission {
  id: string;
  name: string;
  description: string;
  objectives: MissionObjective[];
  rewards: EventReward[];
  sequence?: string; // Next mission ID
}

export interface MissionObjective {
  type: 'collect' | 'defeat' | 'complete' | 'explore' | 'custom';
  targetId?: string;
  targetCount: number;
  currentProgress?: number;
}

export interface EventLeaderboard {
  enabled: boolean;
  resetInterval: 'daily' | 'weekly' | 'event';
  rewards: LeaderboardReward[];
  displayCount: number;
}

export interface EventService {
  async getActiveEvents(): Promise<LiveEvent[]> {
    const now = new Date();
    return this.db.events.find({
      startDate: { $lte: now },
      endDate: { $gte: now },
      visibility: { $ne: 'hidden' },
    });
  }

  async getEventById(id: string): Promise<LiveEvent | null> {
    return this.db.events.findById(id);
  }

  async getPlayerProgress(playerId: string, eventId: string): Promise<EventProgress> {
    const progress = await this.db.eventProgress.findOne({
      playerId,
      eventId,
    });

    if (!progress) {
      return this.createInitialProgress(playerId, eventId);
    }

    return progress;
  }

  async updateMissionProgress(
    playerId: string,
    eventId: string,
    missionId: string,
    objectiveType: string,
    progress: number
  ): Promise<void> {
    await this.db.eventProgress.updateOne(
      { playerId, eventId },
      {
        $set: {
          [`missions.${missionId}.objectives.${objectiveType}.currentProgress`]: progress,
        },
        $push: {
          updateHistory: {
            type: 'progress_update',
            missionId,
            objectiveType,
            progress,
            timestamp: new Date(),
          },
        },
      }
    );

    // Check if mission is complete and trigger rewards
    await this.checkMissionCompletion(playerId, eventId, missionId);
  }

  async claimReward(
    playerId: string,
    eventId: string,
    rewardId: string
  ): Promise<RewardClaimResult> {
    const progress = await this.getPlayerProgress(playerId, eventId);
    const reward = await this.getEventReward(eventId, rewardId);

    // Verify eligibility
    if (!this.isRewardClaimable(progress, reward)) {
      throw new Error('Reward not yet claimable');
    }

    // Grant reward
    await this.grantReward(playerId, reward);

    // Mark as claimed
    await this.db.eventProgress.updateOne(
      { playerId, eventId },
      {
        $addToSet: { claimedRewards: rewardId },
      }
    );

    return { success: true, reward };
  }
}
```

### Step 3.2: Feature Flags

```typescript
// services/feature-flags/src/index.ts
export interface FeatureFlag {
  key: string;
  enabled: boolean;
  rolloutPercentage: number;   // 0-100
  targeting: FlagTargeting;
  defaultValue: unknown;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlagTargeting {
  playerIds?: string[];       // Specific players
  platforms?: string[];
  versions?: string[];
  countries?: string[];
  abTest?: string;           // Synced with A/B test
  playerType?: 'new' | 'returning' | 'vip';
}

export class FeatureFlagService {
  private flags: Map<string, FeatureFlag> = new Map();
  private cache: Redis;
  private readonly CACHE_TTL = 60; // 1 minute

  async initialize(): Promise<void> {
    // Load all flags from database
    const flags = await this.db.featureFlags.findAll();
    for (const flag of flags) {
      this.flags.set(flag.key, flag);
    }
  }

  async isEnabled(key: string, playerId: string, context?: FlagContext): Promise<boolean> {
    const flag = this.flags.get(key);
    if (!flag) return false;

    if (!flag.enabled) return false;

    // Check targeting rules first
    if (flag.targeting.playerIds?.includes(playerId)) {
      return true;
    }

    if (flag.targeting.playerIds?.length && !flag.targeting.playerIds.includes(playerId)) {
      // Player not in include list
      return false;
    }

    // Check percentage rollout
    const hash = this.hash(`${key}:${playerId}`);
    const rollout = hash % 100;
    return rollout < flag.rolloutPercentage;
  }

  async getValue<T>(key: string, playerId: string, defaultValue: T): Promise<T> {
    const isEnabled = await this.isEnabled(key, playerId);
    if (!isEnabled) return defaultValue;

    const flag = this.flags.get(key);
    return (flag?.defaultValue ?? defaultValue) as T;
  }

  async setFlag(key: string, value: Partial<FeatureFlag>): Promise<void> {
    const existing = this.flags.get(key);
    const updated = {
      ...existing,
      ...value,
      updatedAt: new Date(),
    };

    await this.db.featureFlags.upsert({ key, ...updated });
    this.flags.set(key, updated);

    // Invalidate cache
    await this.cache.del(`flag:${key}`);
  }

  async getAllFlags(): Promise<FeatureFlag[]> {
    return Array.from(this.flags.values());
  }
}

// Client-side usage
export class ClientFeatureFlags {
  private flags: Map<string, boolean> = new Map();
  private values: Map<string, unknown> = new Map();

  async refresh(playerId: string): Promise<void> {
    const response = await fetch(`/api/flags?playerId=${playerId}`);
    const data = await response.json();

    for (const flag of data.flags) {
      this.flags.set(flag.key, flag.enabled);
      this.values.set(flag.key, flag.value);
    }
  }

  isEnabled(key: string): boolean {
    return this.flags.get(key) ?? false;
  }

  getValue<T>(key: string, defaultValue: T): T {
    return (this.values.get(key) ?? defaultValue) as T;
  }
}
```

### Step 3.3: Server Configuration

```typescript
// services/content/src/config.ts
export interface GameConfig {
  version: string;
  lastUpdated: Date;
  balance: BalanceConfig;
  economy: EconomyConfig;
  events: EventsConfig;
  features: FeaturesConfig;
  tuning: TuningConfig;
}

export interface BalanceConfig {
  player: {
    startingHealth: number;
    maxHealth: number;
    startingCurrency: number;
    xpMultiplier: number;
  };
  combat: {
    baseDamage: number;
    criticalChance: number;
    criticalMultiplier: number;
    defenseReduction: number;
  };
  progression: {
    xpPerLevel: number[];
    skillPointsPerLevel: number;
  };
}

export interface EconomyConfig {
  currencies: CurrencyDef[];
  items: ItemDef[];
  shops: ShopDef[];
  lootTables: LootTableDef[];
}

export interface TuningConfig {
  matchmaking: {
    maxWaitTime: number;
    skillRange: number;
    partyBonus: number;
  };
  difficulty: {
    enemyHealthMultiplier: number;
    enemyDamageMultiplier: number;
    dropRateMultiplier: number;
  };
}

export class ConfigService {
  private currentConfig: GameConfig | null = null;
  private configHistory: ConfigVersion[] = [];
  private readonly CONFIG_VERSION_HEADER = 'X-Config-Version';

  async getConfig(playerId: string): Promise<GameConfig> {
    // Get base config
    const baseConfig = await this.loadBaseConfig();

    // Apply player-specific overrides
    const playerOverrides = await this.getPlayerOverrides(playerId);

    return this.mergeConfig(baseConfig, playerOverrides);
  }

  async pushConfig(config: GameConfig): Promise<void> {
    // Validate config
    this.validateConfig(config);

    // Save new version
    const version = this.configHistory.length + 1;
    const configVersion: ConfigVersion = {
      version: version,
      config,
      createdAt: new Date(),
      createdBy: 'system',
    };

    await this.db.configVersions.insert(configVersion);
    this.currentConfig = config;
    this.configHistory.push(configVersion);

    // Notify all game servers to refresh
    await this.notifyServersOfUpdate(version);
  }

  async rollback(steps: number = 1): Promise<void> {
    const targetIndex = this.configHistory.length - steps - 1;
    if (targetIndex < 0) {
      throw new Error('Cannot rollback further');
    }

    const targetVersion = this.configHistory[targetIndex];
    await this.pushConfig(targetVersion.config);
  }

  private async notifyServersOfUpdate(version: number): Promise<void> {
    await this.cache.publish('config:update', JSON.stringify({
      version,
      timestamp: Date.now(),
    }));
  }
}
```

## Phase 4 — Operations & Monitoring

**Goal:** Implement monitoring, alerting, and operational tooling.

### Step 4.1: Metrics Dashboard

```typescript
// services/analytics/src/metrics.ts
export interface LiveOpsMetrics {
  // DAU/MAU
  dau: number;
  mau: number;
  stickyFactor: number;

  // Retention
  d1: number;    // Day 1 retention
  d7: number;    // Day 7 retention
  d30: number;   // Day 30 retention

  // Monetization
  arpu: number;  // Average Revenue Per User
  arppu: number; // Average Revenue Per Paying User
  conversionRate: number;

  // Engagement
  avgSessionLength: number;
  sessionsPerUser: number;
  avgLevelComplete: number;

  // Technical
  matchSuccessRate: number;
  apiLatency: LatencyPercentiles;
  errorRate: number;
}

export interface LatencyPercentiles {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}

export class MetricsService {
  async getDAU(startDate?: Date, endDate?: Date): Promise<number> {
    const result = await this.db.query(`
      SELECT COUNT(DISTINCT player_id)
      FROM sessions
      WHERE started_at >= $1 AND started_at <= $2
    `, [startDate ?? this.getDayStart(), endDate ?? new Date()]);

    return result.rows[0]?.count ?? 0;
  }

  async getRetentionCohort(cohortDate: Date, retentionDays: number[]): Promise<Record<number, number>> {
    const result: Record<number, number> = {};

    for (const days of retentionDays) {
      const returnDate = new Date(cohortDate);
      returnDate.setDate(returnDate.getDate() + days);

      const retained = await this.db.query(`
        SELECT COUNT(DISTINCT s1.player_id)
        FROM sessions s1
        JOIN sessions s2 ON s1.player_id = s2.player_id
        WHERE DATE(s1.started_at) = $1
          AND DATE(s2.started_at) = $2
      `, [this.formatDate(cohortDate), this.formatDate(returnDate)]);

      const total = await this.db.query(`
        SELECT COUNT(DISTINCT player_id)
        FROM sessions
        WHERE DATE(started_at) = $1
      `, [this.formatDate(cohortDate)]);

      result[days] = total.rows[0]?.count > 0
        ? (retained.rows[0]?.count / total.rows[0]?.count) * 100
        : 0;
    }

    return result;
  }

  async getDashboard(): Promise<LiveOpsMetrics> {
    const [dau, retention, monetization, engagement, technical] = await Promise.all([
      this.getDauMetrics(),
      this.getRetentionMetrics(),
      this.getMonetizationMetrics(),
      this.getEngagementMetrics(),
      this.getTechnicalMetrics(),
    ]);

    return { ...dau, ...retention, ...monetization, ...engagement, ...technical };
  }
}
```

### Step 4.2: Alerting System

```typescript
// services/ops/src/alerts.ts
export interface AlertRule {
  id: string;
  name: string;
  condition: AlertCondition;
  window: string;         // '5m', '1h', '1d'
  severity: 'info' | 'warning' | 'critical';
  channels: AlertChannel[];
  enabled: boolean;
  cooldownMinutes: number;
  lastTriggered?: Date;
}

export interface AlertCondition {
  metric: string;
  operator: '>' | '<' | '==' | '>=' | '<=';
  threshold: number;
}

export interface AlertChannel {
  type: 'slack' | 'pagerduty' | 'email' | 'webhook';
  target: string;
}

export const DEFAULT_ALERTS: AlertRule[] = [
  {
    id: 'high-error-rate',
    name: 'High Error Rate',
    condition: { metric: 'errorRate', operator: '>', threshold: 5 },
    window: '5m',
    severity: 'critical',
    channels: [
      { type: 'slack', target: '#alerts-critical' },
      { type: 'pagerduty', target: 'PD_SERVICE_ID' },
    ],
    enabled: true,
    cooldownMinutes: 15,
  },
  {
    id: 'matchmaking-latency',
    name: 'Matchmaking Latency High',
    condition: { metric: 'matchmakingLatency.p99', operator: '>', threshold: 10000 },
    window: '5m',
    severity: 'warning',
    channels: [
      { type: 'slack', target: '#alerts-warning' },
    ],
    enabled: true,
    cooldownMinutes: 30,
  },
  {
    id: 'low-dau',
    name: 'Low DAU',
    condition: { metric: 'dau', operator: '<', threshold: 1000 },
    window: '1h',
    severity: 'warning',
    channels: [
      { type: 'slack', target: '#ops-daily' },
    ],
    enabled: true,
    cooldownMinutes: 1440,
  },
];

export class AlertingService {
  private rules: Map<string, AlertRule> = new Map();
  private metrics: MetricsService;
  private notifiers: Map<string, AlertNotifier>;

  async initialize(): Promise<void> {
    // Load rules from database
    const rules = await this.db.alertRules.findAll();
    for (const rule of rules) {
      this.rules.set(rule.id, rule);
    }

    // Start evaluation loop
    this.startEvaluationLoop();
  }

  private startEvaluationLoop(): void {
    setInterval(() => this.evaluateAllRules(), 60000); // Every minute
  }

  async evaluateAllRules(): Promise<void> {
    const metrics = await this.metrics.getDashboard();

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      // Check cooldown
      if (rule.lastTriggered) {
        const minutesSince = (Date.now() - rule.lastTriggered.getTime()) / 60000;
        if (minutesSince < rule.cooldownMinutes) continue;
      }

      // Evaluate condition
      const value = this.getMetricValue(metrics, rule.condition.metric);
      const breached = this.evaluateCondition(value, rule.condition.operator, rule.condition.threshold);

      if (breached) {
        await this.triggerAlert(rule, value);
      }
    }
  }

  private async triggerAlert(rule: AlertRule, currentValue: number): Promise<void> {
    rule.lastTriggered = new Date();
    await this.db.alertRules.update(rule.id, { lastTriggered: rule.lastTriggered });

    for (const channel of rule.channels) {
      await this.notifiers.get(channel.type).send({
        rule: rule,
        currentValue,
        timestamp: new Date(),
        severity: rule.severity,
      });
    }
  }
}
```

### Step 4.3: Admin Tools

```typescript
// services/admin/src/api.ts
export class AdminAPI {
  @auth(roles: ['admin'])
  async getPlayer(id: string): Promise<Player> {
    return this.playerService.findById(id);
  }

  @auth(roles: ['admin'])
  async updatePlayer(id: string, changes: Partial<Player>): Promise<Player> {
    return this.playerService.update(id, changes);
  }

  @auth(roles: ['admin', 'support'])
  async grantCurrency(
    playerId: string,
    type: string,
    amount: number,
    reason: string
  ): Promise<void> {
    // Verify reason is provided (audit trail)
    if (!reason) {
      throw new Error('Reason is required for currency grants');
    }

    const player = await this.playerService.findById(playerId);
    const newBalance = (player.currency[type] ?? 0) + amount;

    await this.playerService.updateCurrency(playerId, {
      ...player.currency,
      [type]: newBalance,
    });

    // Log for audit
    await this.db.auditLog.insert({
      action: 'currency_grant',
      playerId,
      type,
      amount,
      reason,
      adminId: this.getCurrentAdminId(),
      timestamp: new Date(),
    });
  }

  @auth(roles: ['admin'])
  async banPlayer(
    id: string,
    reason: string,
    duration: string,
    permanent: boolean = false
  ): Promise<void> {
    const banUntil = permanent ? null : this.parseDuration(duration);

    await this.db.players.update(id, {
      banned: true,
      banReason: reason,
      banUntil,
      banAdminId: this.getCurrentAdminId(),
    });

    // Force logout
    await this.sessionService.forceLogout(id);

    await this.db.auditLog.insert({
      action: 'player_ban',
      playerId: id,
      reason,
      duration: permanent ? 'permanent' : duration,
      adminId: this.getCurrentAdminId(),
      timestamp: new Date(),
    });
  }

  @auth(roles: ['admin'])
  async pushConfig(config: GameConfig): Promise<void> {
    await this.configService.pushConfig(config);

    await this.db.auditLog.insert({
      action: 'config_push',
      version: config.version,
      adminId: this.getCurrentAdminId(),
      timestamp: new Date(),
    });
  }

  @auth(roles: ['admin'])
  async rollbackConfig(steps: number = 1): Promise<void> {
    await this.configService.rollback(steps);

    await this.db.auditLog.insert({
      action: 'config_rollback',
      steps,
      adminId: this.getCurrentAdminId(),
      timestamp: new Date(),
    });
  }

  @auth(roles: ['admin'])
  async toggleFeatureFlag(key: string, enabled: boolean): Promise<void> {
    await this.featureFlagService.setFlag(key, { enabled });

    await this.db.auditLog.insert({
      action: 'flag_toggle',
      key,
      enabled,
      adminId: this.getCurrentAdminId(),
      timestamp: new Date(),
    });
  }
}
```

## Common Mistakes

| # | Mistake | Why It Fails | Solution |
|---|---------|---------------|----------|
| 1 | Analytics as afterthought | Can't measure anything | Build analytics from day one |
| 2 | Hardcoded server IPs | Can't scale | Use service discovery |
| 3 | No feature flags | Can't roll back features | Implement flag system first |
| 4 | State in game server memory | Lost on restart | Use Redis/DB for state |
| 5 | No rate limiting | DDOS vulnerability | Implement per-IP and per-user limits |
| 6 | Monolithic backend | Can't scale individual parts | Microservices with clear boundaries |
| 7 | No monitoring | Blind to problems | Implement comprehensive monitoring |
| 8 | Direct DB access from clients | Security risk | Always use API layer |
| 9 | No idempotent operations | Double-spend, data corruption | Design for retries |
| 10 | Ignoring GDPR/CCPA | Legal risk | Design privacy compliance in |

## Execution Checklist

### Backend Infrastructure
- [ ] API Gateway with auth, rate limiting, routing
- [ ] Player data service with caching
- [ ] Message queue for event streaming
- [ ] Health check aggregation
- [ ] Database migration system

### Analytics & A/B Testing
- [ ] Analytics event schema defined
- [ ] Client analytics SDK with batching
- [ ] A/B testing framework with variant assignment
- [ ] Metrics dashboard API

### Live Event & Content Systems
- [ ] Live event system with progress tracking
- [ ] Feature flag system with targeting
- [ ] Server config push system
- [ ] Rollback procedures

### Operations & Monitoring
- [ ] Alert rules and notification system
- [ ] Admin tooling for player management
- [ ] Load testing completed
- [ ] Security audit passed
- [ ] Rollback procedures documented
