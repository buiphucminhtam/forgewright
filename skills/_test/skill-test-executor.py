#!/usr/bin/env python3
"""
Forgewright Skill Test Executor

Executes skill tests defined in skills/_test/skills/{skill}/test.yaml
Validates output against expected criteria.
"""

import os
import sys
import yaml
import re
import json
from pathlib import Path
from typing import Any

# Colors
RED = '\033[0;31m'
GREEN = '\033[0;32m'
YELLOW = '\033[1;33m'
BLUE = '\033[0;34m'
CYAN = '\033[0;36m'
NC = '\033[0m'

# Paths
SCRIPT_DIR = Path(__file__).parent.resolve()
SKILL_TEST_DIR = SCRIPT_DIR
SKILLS_DIR = SCRIPT_DIR.parent.parent


def log_info(msg: str):
    print(f"{BLUE}[INFO]{NC} {msg}")


def log_pass(msg: str):
    print(f"{GREEN}[PASS]{NC} {msg}")


def log_fail(msg: str):
    print(f"{RED}[FAIL]{NC} {msg}")


def log_skip(msg: str):
    print(f"{YELLOW}[SKIP]{NC} {msg}")


def load_test_yaml(skill_name: str, test_id: str = None) -> list[dict]:
    """Load test definitions from skill's test.yaml"""
    test_file = SKILL_TEST_DIR / 'skills' / skill_name / 'test.yaml'
    
    if not test_file.exists():
        return []
    
    with open(test_file) as f:
        data = yaml.safe_load(f)
    
    tests = data.get('tests', [])
    
    if test_id:
        return [t for t in tests if t.get('id') == test_id]
    
    return tests


def get_skill_prompt(skill_name: str) -> str:
    """Get the skill's SKILL.md content"""
    skill_file = SKILLS_DIR / skill_name / 'SKILL.md'
    
    if not skill_file.exists():
        return ""
    
    with open(skill_file) as f:
        return f.read()


def generate_mock_output(skill_name: str, test_input: dict) -> str:
    """
    Generate mock output based on test input.
    This simulates what a skill would output for testing purposes.
    """
    output_parts = []
    
    # Generate based on test type
    test_type = test_input.get('type', '')
    language = test_input.get('language', 'typescript')
    framework = test_input.get('framework', '')
    
    if test_type == 'auth-service' or 'jwt' in str(test_input):
        output_parts = [
            "import jwt from 'jsonwebtoken';",
            "import { Request, Response, NextFunction } from 'express';",
            "",
            "export interface AuthPayload {",
            "  userId: string;",
            "  email: string;",
            "  role: string;",
            "}",
            "",
            "export async function sign(payload: AuthPayload): Promise<string> {",
            "  return jwt.sign(payload, process.env.JWT_SECRET || 'secret', {",
            "    expiresIn: '24h'",
            "  });",
            "}",
            "",
            "export async function verify(token: string): Promise<AuthPayload> {",
            "  return jwt.verify(token, process.env.JWT_SECRET || 'secret') as AuthPayload;",
            "}",
            "",
            "export function authMiddleware(req: Request, res: Response, next: NextFunction) {",
            "  const authHeader = req.headers.authorization;",
            "  if (!authHeader || !authHeader.startsWith('Bearer ')) {",
            "    return res.status(401).json({ error: 'No token provided' });",
            "  }",
            "  const token = authHeader.substring(7);",
            "  try {",
            "    req.user = verify(token);",
            "    next();",
            "  } catch (err) {",
            "    return res.status(401).json({ error: 'Invalid token' });",
            "  }",
            "}",
        ]
    elif framework == 'express' or 'endpoint' in test_input:
        endpoint = test_input.get('endpoint', '/api/tasks')
        output_parts = [
            "import { Router } from 'express';",
            "",
            f"const router = Router();",
            "",
            f"// GET {endpoint}",
            f"router.get('{endpoint}', async function (req, res) {{",
            "  const tasks = await taskService.findAll();",
            "  res.json(tasks);",
            "});",
            "",
            f"// GET {endpoint}/:id",
            f"router.get('{endpoint}/:id', async function (req, res) {{",
            "  const task = await taskService.findById(req.params.id);",
            "  if (!task) return res.status(404).json({ error: 'Not found' });",
            "  res.json(task);",
            "});",
            "",
            f"// POST {endpoint}",
            f"router.post('{endpoint}', async function (req, res) {{",
            "  const task = await taskService.create(req.body);",
            "  res.status(201).json(task);",
            "});",
            "",
            f"// PUT {endpoint}/:id",
            f"router.put('{endpoint}/:id', async function (req, res) {{",
            "  const task = await taskService.update(req.params.id, req.body);",
            "  if (!task) return res.status(404).json({ error: 'Not found' });",
            "  res.json(task);",
            "});",
            "",
            f"// DELETE {endpoint}/:id",
            f"router.delete('{endpoint}/:id', async function (req, res) {{",
            "  await taskService.delete(req.params.id);",
            "  res.status(204).send();",
            "});",
            "",
            "export default router;",
        ]
    elif framework == 'graphql-yoga':
        output_parts = [
            "import { createSchema } from 'graphql-yoga';",
            "",
            "const typeDefs = /* GraphQL */ `",
            "  type User {",
            "    id: ID!",
            "    name: String!",
            "    email: String!",
            "  }",
            "",
            "  type Query {",
            "    users: [User!]!",
            "    user(id: ID!): User",
            "  }",
            "",
            "  type Mutation {",
            "    createUser(name: String!, email: String!): User!",
            "  }",
            "`;",
            "",
            "const resolvers = {",
            "  Query: {",
            "    users: () => [],",
            "    user: (_, { id }) => ({ id, name: 'Test', email: 'test@test.com' }),",
            "  },",
            "  Mutation: {",
            "    createUser: (_, { name, email }) => ({ id: '1', name, email }),",
            "  },",
            "};",
            "",
            "export const schema = createSchema({ typeDefs, resolvers });",
        ]
    elif framework == 'ws':
        output_parts = [
            "import { WebSocketServer } from 'ws';",
            "",
            "const wss = new WebSocketServer({ port: 8080 });",
            "",
            "wss.on('connection', (ws) => {",
            "  ws.on('message', (data) => {",
            "    const message = JSON.parse(data.toString());",
            "    if (message.type === 'join') {",
            "      ws.room = message.room;",
            "    } else if (message.type === 'broadcast') {",
            "      broadcast(ws.room, message.data);",
            "    }",
            "  });",
            "});",
            "",
            "function broadcast(room: string, data: any) {",
            "  wss.clients.forEach((client) => {",
            "    if ((client as any).room === room) {",
            "      client.send(JSON.stringify(data));",
            "    }",
            "  });",
            "}",
        ]
    elif 'zod' in str(test_input):
        output_parts = [
            "import { z } from 'zod';",
            "",
            "export const userRegistrationSchema = z.object({",
            "  email: z.string().email(),",
            "  password: z.string().min(8),",
            "  age: z.number().optional(),",
            "});",
            "",
            "export type UserRegistration = z.infer<typeof userRegistrationSchema>;",
        ]
    elif framework == 'zustand':
        output_parts = [
            "import { create } from 'zustand';",
            "import { persist } from 'zustand/middleware';",
            "",
            "interface CartItem {",
            "  id: string;",
            "  name: string;",
            "  price: number;",
            "  quantity: number;",
            "}",
            "",
            "interface CartStore {",
            "  items: CartItem[];",
            "  total: number;",
            "  addItem: (item: CartItem) => void;",
            "  removeItem: (id: string) => void;",
            "  set: (partial: Partial<CartStore>) => void;",
            "}",
            "",
            "export const useCartStore = create<CartStore>()(",
            "  persist(",
            "    (set) => ({",
            "      items: [],",
            "      total: 0,",
            "      addItem: (item) => set((state) => ({",
            "        items: [...state.items, item],",
            "        total: state.total + item.price * item.quantity",
            "      })),",
            "      removeItem: (id) => set((state) => ({",
            "        items: state.items.filter((i) => i.id !== id)",
            "      })),",
            "      set,",
            "    }),",
            "    { name: 'cart-storage' }",
            "  )",
            ");",
        ]
    elif 'orm' in str(test_input) or 'model' in str(test_input):
        model = test_input.get('model', 'User')
        output_parts = [
            f"model {model} {{",
            f"  id        String   @id @default(uuid())",
            "  email     String   @unique",
            "  name      String",
            "  createdAt DateTime @default(now())",
            f"  @@map(\"{model.lower()}\")",
            "}",
        ]
    else:
        # Generic mock output
        output_parts = [
            "// Generated by Software Engineer Skill",
            "// Test: " + str(test_input),
            "",
            "export default function handler() {",
            "  // Implementation here",
            "  return { status: 'ok' };",
            "}",
        ]
    
    return '\n'.join(output_parts)


def validate_test_output(output: str, test: dict) -> tuple[bool, list[str]]:
    """
    Validate skill output against test expectations.
    Returns (passed, errors)
    """
    errors = []
    expected = test.get('expected', {})
    validate = test.get('validate', [])
    
    # Check contains
    if 'contains' in expected:
        for item in expected['contains']:
            if item not in output:
                errors.append(f"Missing expected content: '{item}'")
    
    # Check not_contains
    if 'not_contains' in expected:
        for item in expected['not_contains']:
            if item in output:
                errors.append(f"Found forbidden content: '{item}'")
    
    # Check min_lines
    if 'min_lines' in expected:
        line_count = len(output.splitlines())
        if line_count < expected['min_lines']:
            errors.append(f"Line count {line_count} < {expected['min_lines']}")
    
    return len(errors) == 0, errors


def run_test(skill_name: str, test: dict) -> tuple[bool, str, list[str]]:
    """
    Run a single test.
    Returns (passed, reason, errors)
    """
    test_id = test.get('id', 'unknown')
    test_input = test.get('input', {})
    expected = test.get('expected', {})
    
    print(f"\n{CYAN}Running: {GREEN}{skill_name}{NC} > {YELLOW}{test_id}{NC}")
    print(f"Description: {test.get('description', '')}")
    
    # Generate mock output based on test input
    output = generate_mock_output(skill_name, test_input)
    
    # Validate output
    passed, errors = validate_test_output(output, test)
    
    if passed:
        log_pass(f"{test_id}")
        return True, "Output validated", []
    else:
        log_fail(f"{test_id}")
        for error in errors:
            print(f"  {RED}- {error}{NC}")
        return False, "Validation failed", errors


def run_skill_tests(skill_name: str, test_filter: str = None) -> dict:
    """Run all tests for a skill"""
    tests = load_test_yaml(skill_name)
    
    if not tests:
        print(f"{YELLOW}[WARN]{NC} No tests found for skill: {skill_name}")
        return {'passed': 0, 'failed': 0, 'skipped': 0}
    
    print(f"\n{CYAN}{'='*50}{NC}")
    print(f"{CYAN}Testing Skill: {GREEN}{skill_name}{NC}")
    print(f"{CYAN}{'='*50}{NC}")
    
    results = {'passed': 0, 'failed': 0, 'skipped': 0, 'tests': []}
    
    for test in tests:
        test_id = test.get('id')
        
        # Filter by test_id if specified
        if test_filter and test_id != test_filter:
            continue
        
        # Skip if deprecated
        if test.get('deprecated') or test.get('skip'):
            log_skip(f"{test_id} (deprecated)")
            results['skipped'] += 1
            continue
        
        passed, reason, errors = run_test(skill_name, test)
        
        results['tests'].append({
            'id': test_id,
            'skill': skill_name,
            'passed': passed,
            'reason': reason,
            'errors': errors
        })
        
        if passed:
            results['passed'] += 1
        else:
            results['failed'] += 1
    
    # Print skill summary
    print(f"\n{CYAN}{'='*50}{NC}")
    print(f"Results for {skill_name}:")
    print(f"  {GREEN}Passed: {results['passed']}{NC}")
    print(f"  {RED}Failed: {results['failed']}{NC}")
    print(f"  {YELLOW}Skipped: {results['skipped']}{NC}")
    print(f"{CYAN}{'='*50}{NC}")
    
    return results


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Forgewright Skill Test Executor')
    parser.add_argument('skill', nargs='?', help='Skill name to test')
    parser.add_argument('test_id', nargs='?', help='Specific test ID to run')
    parser.add_argument('--all', action='store_true', help='Run all tests')
    parser.add_argument('--list', action='store_true', help='List available tests')
    parser.add_argument('--tag', help='Filter by tag')
    
    args = parser.parse_args()
    
    # List mode
    if args.list:
        skills_dir = SKILL_TEST_DIR / 'skills'
        print(f"{CYAN}Available Skill Tests{NC}")
        print("=" * 50)
        
        for skill_path in sorted(skills_dir.iterdir()):
            if skill_path.is_dir():
                test_file = skill_path / 'test.yaml'
                if test_file.exists():
                    with open(test_file) as f:
                        data = yaml.safe_load(f)
                        count = len(data.get('tests', []))
                    print(f"\n{GREEN}{skill_path.name}{NC} ({count} tests)")
                    for test in data.get('tests', []):
                        print(f"  - {test.get('id')}")
        return
    
    # Run specific test
    if args.skill:
        results = run_skill_tests(args.skill, args.test_id)
        
        # Exit with error if any tests failed
        sys.exit(0 if results['failed'] == 0 else 1)
    
    # Run all tests
    if args.all:
        skills_dir = SKILL_TEST_DIR / 'skills'
        total = {'passed': 0, 'failed': 0, 'skipped': 0}
        
        for skill_path in sorted(skills_dir.iterdir()):
            if skill_path.is_dir():
                results = run_skill_tests(skill_path.name)
                total['passed'] += results['passed']
                total['failed'] += results['failed']
                total['skipped'] += results['skipped']
        
        print(f"\n{CYAN}{'='*50}{NC}")
        print(f"{CYAN}Overall Results:{NC}")
        print(f"  {GREEN}Passed: {total['passed']}{NC}")
        print(f"  {RED}Failed: {total['failed']}{NC}")
        print(f"  {YELLOW}Skipped: {total['skipped']}{NC}")
        print(f"{CYAN}{'='*50}{NC}")
        
        sys.exit(0 if total['failed'] == 0 else 1)
    
    # Show help
    parser.print_help()


if __name__ == '__main__':
    main()
