/**
 * Framework detection — detect entry points from framework-specific patterns.
 *
 * Supports: Next.js, FastAPI, NestJS, Prisma, Supabase, Laravel, Rails,
 * Spring, Gin, Fiber, Express, Hapi, Fastify, Django, Flask, Rails,
 * Phoenix, Vapor, Echo, Koa, SvelteKit, Remix, Astro, Expo, Capacitor,
 * Flutter, React Native, Electron, Tauri, Unity, Godot, Unreal.
 */

import type { CodeNode, CodeEdge } from '../types.js';

export interface FrameworkDetection {
  framework: string;
  version?: string;
  entryPatterns: string[];
  ormPatterns?: string[];
  databasePatterns?: string[];
}

/**
 * All supported framework detections.
 */
export const FRAMEWORK_DETECTIONS: FrameworkDetection[] = [
  // --- Web Frameworks ---
  {
    framework: 'next.js',
    entryPatterns: [
      'app/', 'pages/', 'src/app/', 'src/pages/',
      'route.ts', 'route.js', 'layout.ts', 'layout.js',
      'middleware.ts', 'middleware.js',
    ],
  },
  {
    framework: 'remix',
    entryPatterns: [
      'app/routes/', 'app/models/', 'app/root.tsx', 'remix.config.js',
    ],
  },
  {
    framework: 'astro',
    entryPatterns: [
      'src/pages/', 'src/layouts/', 'astro.config.mjs', '.astro/',
    ],
  },
  {
    framework: 'sveltekit',
    entryPatterns: [
      'src/routes/', 'src/lib/server/', 'svelte.config.js',
    ],
  },
  {
    framework: 'nestjs',
    entryPatterns: [
      '@Controller(', '@Module(', '@Injectable(', '@Get(', '@Post(',
      '@Put(', '@Delete(', '@Patch(',
    ],
    ormPatterns: ['TypeORM', 'Typegoose', 'nestjs/typeorm', 'getRepository('],
  },
  {
    framework: 'express',
    entryPatterns: [
      'app.get(', 'router.get(', 'router.post(', 'app.post(',
      'router.put(', 'router.delete(', 'app.use(',
    ],
  },
  {
    framework: 'fastify',
    entryPatterns: [
      'fastify.get(', 'fastify.post(', 'fastify.put(', 'fastify.delete(',
      'fastify.register(', '@fastify/',
    ],
  },
  {
    framework: 'fastapi',
    entryPatterns: [
      '@app.get(', '@router.get(', '@app.post(', '@router.post(',
      'FastAPI(', 'APIRouter(',
    ],
  },
  {
    framework: 'django',
    entryPatterns: [
      'from django', 'urls.py', 'views.py', 'urlpatterns',
      '@login_required', '@permission_required', 'django.db',
    ],
    databasePatterns: ['django.db.models', 'models.Model', '.objects.filter'],
  },
  {
    framework: 'flask',
    entryPatterns: [
      '@app.route(', '@blueprint.route(', 'Flask(',
    ],
  },
  {
    framework: 'spring',
    entryPatterns: [
      '@RestController', '@Controller', '@Service', '@Repository',
      '@RequestMapping', '@GetMapping', '@PostMapping',
      'public class.*Controller', 'public class.*Service',
    ],
    ormPatterns: ['@Entity', '@Table', '@Column', '@ManyToOne', 'JPA', 'Hibernate'],
    databasePatterns: ['spring.jpa', 'spring.datasource', '@Query('],
  },
  {
    framework: 'rails',
    entryPatterns: [
      'app/controllers/', 'app/models/', 'config/routes.rb',
      'ActiveRecord::Base', 'class.*Controller < ApplicationController',
    ],
    ormPatterns: ['ActiveRecord', '.where(', '.find(', '.create('],
    databasePatterns: ['ActiveRecord::Base', 'migrate/', 'schema.rb'],
  },
  {
    framework: 'laravel',
    entryPatterns: [
      'Route::', 'app/Http/Controllers/', 'app/Models/',
      'public function index(', 'public function store(',
    ],
    ormPatterns: ['Eloquent', 'Model', 'DB::table', 'Schema::'],
    databasePatterns: ['Schema::create', 'DB::', 'Migration'],
  },
  {
    framework: 'gin',
    entryPatterns: [
      'gin.Default(', 'r.GET(', 'r.POST(', 'r.PUT(', 'r.DELETE(',
    ],
  },
  {
    framework: 'fiber',
    entryPatterns: [
      'app.Get(', 'app.Post(', 'app.Put(', 'app.Delete(',
      'fiber.NewApp(',
    ],
  },
  {
    framework: 'echo',
    entryPatterns: [
      'e.GET(', 'e.POST(', 'e.PUT(', 'e.DELETE(',
    ],
  },
  {
    framework: 'koa',
    entryPatterns: [
      'router.get(', 'router.post(', 'app.use(',
    ],
  },
  {
    framework: 'hapi',
    entryPatterns: [
      'server.route(', 'exports.plugin =', '@hapi/',
    ],
  },

  // --- Mobile ---
  {
    framework: 'react-native',
    entryPatterns: [
      'import { registerRootComponent }', 'AppRegistry.registerComponent',
      'import React', 'useState', 'useEffect',
    ],
  },
  {
    framework: 'expo',
    entryPatterns: [
      'expo-', 'registerRootComponent', 'expo dev',
      'npx expo start', '@expo/',
    ],
  },
  {
    framework: 'flutter',
    entryPatterns: [
      'void main(', 'class _MyApp', 'MaterialApp(',
      'StatelessWidget', 'StatefulWidget',
    ],
  },

  // --- Desktop ---
  {
    framework: 'electron',
    entryPatterns: [
      'app.whenReady()', 'BrowserWindow', 'ipcMain',
      'webPreferences:', 'mainWindow',
    ],
  },
  {
    framework: 'tauri',
    entryPatterns: [
      '#[tauri::', 'tauri::', 'TauriBuilder', 'app.handle(',
    ],
  },

  // --- ORMs ---
  {
    framework: 'prisma',
    entryPatterns: [
      'generator client', 'datasource db', 'prisma.',
      'client.', '@prisma/client',
    ],
    ormPatterns: [
      'model User {', 'prisma.users', 'prisma.$connect',
      'PrismaClient', '.findMany(', '.create(',
    ],
    databasePatterns: ['datasource db {', 'provider = "postgresql"', 'provider = "mysql"', 'provider = "sqlite"'],
  },
  {
    framework: 'supabase',
    entryPatterns: [
      'createClient(', '@supabase/', 'supabase.',
      'supabaseClient', '.from(', '.insert(',
    ],
    databasePatterns: ['supabase', '.select(', '.update(', '.delete('],
  },
  {
    framework: 'drizzle',
    entryPatterns: [
      'drizzle-orm', 'drizzle(', 'pgTable(', 'sqliteTable(',
    ],
    databasePatterns: ['drizzle', 'pgTable', 'sqliteTable'],
  },
  {
    framework: 'typeorm',
    entryPatterns: [
      '@Entity(', '@PrimaryGeneratedColumn', '@Column(',
      'getRepository(', 'DataSource',
    ],
    databasePatterns: ['@Entity', '@Column', '@PrimaryColumn', 'dataSource'],
  },

  // --- Game Engines ---
  {
    framework: 'unity',
    entryPatterns: [
      'using UnityEngine', 'MonoBehaviour', '@serializable',
      'void Start(', 'void Update(', '[SerializeField]',
    ],
  },
  {
    framework: 'godot',
    entryPatterns: [
      'extends Node', 'extends Godot', '_ready(', '_process(',
      'func _ready(', 'func _process(',
    ],
  },
  {
    framework: 'unreal',
    entryPatterns: [
      'UCLASS(', 'UFUNCTION(', 'UPROPERTY(', 'GENERATED_BODY(',
      'UObject', 'AActor', 'UAnimInstance',
    ],
  },
  {
    framework: 'roblox',
    entryPatterns: [
      'local function', 'workspace:', 'game:GetService(',
      'ReplicatedStorage', 'ServerScriptService',
    ],
  },
];

/**
 * Detect frameworks from file paths and content patterns.
 */
export function detectFrameworks(
  files: string[],
  contentMap?: Map<string, string>
): FrameworkDetection[] {
  const detected = new Map<string, FrameworkDetection>();

  for (const detection of FRAMEWORK_DETECTIONS) {
    let matched = false;

    for (const pattern of detection.entryPatterns) {
      // Check file paths first (fast)
      for (const file of files) {
        if (file.includes(pattern)) {
          detected.set(detection.framework, detection);
          matched = true;
          break;
        }
      }

      if (matched) break;

      // Check file contents
      if (contentMap) {
        for (const [, content] of contentMap) {
          if (content.includes(pattern)) {
            detected.set(detection.framework, detection);
            matched = true;
            break;
          }
        }
      }

      if (matched) break;
    }
  }

  return [...detected.values()];
}

/**
 * Detect ORM patterns and add QUERIES edges.
 */
export function detectORMQueries(
  nodes: CodeNode[],
  contentMap: Map<string, string>
): CodeEdge[] {
  const edges: CodeEdge[] = [];
  const detectedFrameworks = detectFrameworks([], contentMap);

  const ormPatterns = new Set<string>();
  for (const fw of detectedFrameworks) {
    if (fw.ormPatterns) {
      for (const p of fw.ormPatterns) ormPatterns.add(p);
    }
  }

  if (ormPatterns.size === 0) return edges;

  for (const node of nodes) {
    if (node.type !== 'Function' && node.type !== 'Method') continue;

    const content = contentMap.get(node.filePath);
    if (!content) continue;

    for (const pattern of ormPatterns) {
      if (content.includes(pattern)) {
        edges.push({
          id: `${node.uid}->QUERIES:${pattern}`,
          fromUid: node.uid,
          toUid: `ORM:${pattern}`,
          type: 'QUERIES',
          confidence: 0.9,
          reason: `orm-${detectedFrameworks.find(f => f.ormPatterns?.includes(pattern))?.framework}`,
        });
        break;
      }
    }
  }

  return edges;
}
