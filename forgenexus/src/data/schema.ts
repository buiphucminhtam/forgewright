/**
 * SQLite Database Schema for ForgeNexus
 * Single CodeRelation table with type property (unified graph schema).
 *
 * Full Edge Types (17 total):
 *   CONTAINS        — file/folder contains a symbol
 *   DEFINES         — a symbol defines another (e.g. interface defines method)
 *   CALLS           — function/method calls another
 *   IMPORTS         — module/file imports another module
 *   EXTENDS         — class extends another
 *   IMPLEMENTS      — class implements interface
 *   HAS_METHOD      — class/interface has a method member
 *   HAS_PROPERTY    — class/interface has a property member
 *   ACCESSES        — symbol accesses a variable/field
 *   OVERRIDES       — method overrides parent method
 *   MEMBER_OF       — method/property belongs to a class/struct
 *   STEP_IN_PROCESS — function is part of an execution flow
 *   HANDLES_ROUTE   — function handles an HTTP route
 *   FETCHES         — function fetches from external service
 *   HANDLES_TOOL    — function handles an MCP/RPC tool
 *   ENTRY_POINT_OF  — symbol is entry point of a process
 *   QUERIES         — function issues a database query
 */

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
  uid TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  column_num INTEGER,
  return_type TEXT,
  parameter_count INTEGER,
  declared_type TEXT,
  language TEXT,
  signature TEXT,
  community TEXT,
  process_name TEXT,
  embedding TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file_path);
CREATE INDEX IF NOT EXISTS idx_nodes_community ON nodes(community);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  from_uid TEXT NOT NULL,
  to_uid TEXT NOT NULL,
  type TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,
  reason TEXT,
  step INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_uid);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_uid);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type);
CREATE INDEX IF NOT EXISTS idx_edges_type_from ON edges(type, from_uid);
CREATE INDEX IF NOT EXISTS idx_edges_type_to ON edges(type, to_uid);

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  keywords TEXT NOT NULL,
  description TEXT,
  cohesion REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS processes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  entry_point_uid TEXT NOT NULL,
  terminal_uids TEXT NOT NULL,
  communities TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS registry (
  name TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  db_path TEXT NOT NULL,
  indexed_at TEXT NOT NULL,
  last_commit TEXT,
  stats TEXT NOT NULL,
  language TEXT DEFAULT 'unknown'
);
`.trim()
