import { describe, it, expect } from 'vitest';
import { getAllSkills, getSharedProtocols, _setRootOverride } from './skill-parser.js';
describe('Skill Parser', () => {
    describe('getSharedProtocols', () => {
        it('returns empty array when protocols dir missing', () => {
            _setRootOverride('/nonexistent');
            const protocols = getSharedProtocols();
            expect(protocols).toEqual([]);
        });
    });
    describe('getAllSkills', () => {
        it('returns empty array when skills dir missing', () => {
            _setRootOverride('/nonexistent');
            const skills = getAllSkills();
            expect(skills).toEqual([]);
        });
    });
});
