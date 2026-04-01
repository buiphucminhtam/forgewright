/**
 * MRO (Method Resolution Order) Processor
 *
 * Walks the inheritance DAG (EXTENDS/IMPLEMENTS edges), collects methods from
 * each ancestor via HAS_METHOD edges, detects method-name collisions across
 * parents, and applies language-specific resolution rules to emit OVERRIDES edges.
 *
 * Language-specific rules:
 * - C++:       leftmost base class in declaration order wins
 * - C#/Java:   class method wins over interface default; multiple interface
 *              methods with same name are ambiguous (null resolution)
 * - Python:    C3 linearization determines MRO; first in linearized order wins
 * - Rust:      no auto-resolution — requires qualified syntax, resolvedTo = null
 * - Default:   single inheritance — first definition wins
 *
 * OVERRIDES edge direction: Class → Method (not Method → Method).
 * The source is the child class that inherits conflicting methods,
 * the target is the winning ancestor method node.
 * Cypher: MATCH (c:Class)-[r:CodeRelation {type: 'OVERRIDES'}]->(m:Method)
 */
import { KnowledgeGraph } from '../graph/types.js';
import { SupportedLanguages } from '../../config/supported-languages.js';
export interface MROEntry {
    classId: string;
    className: string;
    language: SupportedLanguages;
    mro: string[];
    ambiguities: MethodAmbiguity[];
}
export interface MethodAmbiguity {
    methodName: string;
    definedIn: Array<{
        classId: string;
        className: string;
        methodId: string;
    }>;
    resolvedTo: string | null;
    reason: string;
}
export interface MROResult {
    entries: MROEntry[];
    overrideEdges: number;
    ambiguityCount: number;
}
export declare function computeMRO(graph: KnowledgeGraph): MROResult;
