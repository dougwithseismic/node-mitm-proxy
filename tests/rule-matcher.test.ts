import { describe, it, expect } from 'vitest';
import { matchRules } from '../src/rules/rule-matcher.js';
import type { Rule } from '../src/rules/types.js';

function makeRule(overrides: Partial<Rule> & { config: Rule['config'] }): Rule {
  return {
    id: 'test:1',
    source: 'api',
    enabled: true,
    ...overrides,
  };
}

describe('matchRules', () => {
  it('matches by substring pattern (default)', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'r1',
        config: { name: 'api-rule', match: { pattern: 'api.example.com' }, phase: 'request' },
      }),
    ];

    const matched = matchRules(rules, 'https://api.example.com/users', 'GET', 'request');
    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe('r1');
  });

  it('does not match when URL does not contain pattern', () => {
    const rules: Rule[] = [
      makeRule({
        config: { name: 'x', match: { pattern: 'api.example.com' }, phase: 'request' },
      }),
    ];

    expect(matchRules(rules, 'https://other.com', 'GET', 'request')).toHaveLength(0);
  });

  it('matches by regex pattern', () => {
    const rules: Rule[] = [
      makeRule({
        config: { name: 'regex', match: { pattern: '\\.json$', type: 'regex' }, phase: 'request' },
      }),
    ];

    expect(matchRules(rules, 'https://api.com/data.json', 'GET', 'request')).toHaveLength(1);
    expect(matchRules(rules, 'https://api.com/data.xml', 'GET', 'request')).toHaveLength(0);
  });

  it('handles invalid regex gracefully', () => {
    const rules: Rule[] = [
      makeRule({
        config: { name: 'bad-regex', match: { pattern: '[invalid', type: 'regex' }, phase: 'request' },
      }),
    ];

    expect(matchRules(rules, 'anything', 'GET', 'request')).toHaveLength(0);
  });

  it('matches by glob pattern', () => {
    const rules: Rule[] = [
      makeRule({
        config: { name: 'glob', match: { pattern: '**/api/**', type: 'glob' }, phase: 'request' },
      }),
    ];

    expect(matchRules(rules, 'https://example.com/api/users', 'GET', 'request')).toHaveLength(1);
    expect(matchRules(rules, 'https://example.com/static/img.png', 'GET', 'request')).toHaveLength(0);
  });

  it('filters by phase', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'req',
        config: { name: 'req-rule', match: { pattern: 'api' }, phase: 'request' },
      }),
      makeRule({
        id: 'res',
        config: { name: 'res-rule', match: { pattern: 'api' }, phase: 'response' },
      }),
    ];

    const reqMatches = matchRules(rules, 'https://api.com', 'GET', 'request');
    expect(reqMatches).toHaveLength(1);
    expect(reqMatches[0].id).toBe('req');

    const resMatches = matchRules(rules, 'https://api.com', 'GET', 'response');
    expect(resMatches).toHaveLength(1);
    expect(resMatches[0].id).toBe('res');
  });

  it('filters by HTTP method', () => {
    const rules: Rule[] = [
      makeRule({
        config: { name: 'post-only', match: { pattern: 'api', methods: ['POST'] }, phase: 'request' },
      }),
    ];

    expect(matchRules(rules, 'https://api.com', 'POST', 'request')).toHaveLength(1);
    expect(matchRules(rules, 'https://api.com', 'GET', 'request')).toHaveLength(0);
  });

  it('method matching is case-insensitive', () => {
    const rules: Rule[] = [
      makeRule({
        config: { name: 'x', match: { pattern: 'api', methods: ['post'] }, phase: 'request' },
      }),
    ];

    expect(matchRules(rules, 'https://api.com', 'POST', 'request')).toHaveLength(1);
  });

  it('matches all methods when methods array is empty or absent', () => {
    const rules: Rule[] = [
      makeRule({
        id: 'no-methods',
        config: { name: 'any', match: { pattern: 'api', methods: [] }, phase: 'request' },
      }),
      makeRule({
        id: 'undef-methods',
        config: { name: 'any2', match: { pattern: 'api' }, phase: 'request' },
      }),
    ];

    expect(matchRules(rules, 'https://api.com', 'DELETE', 'request')).toHaveLength(2);
  });

  it('skips disabled rules', () => {
    const rules: Rule[] = [
      makeRule({
        enabled: false,
        config: { name: 'disabled', match: { pattern: 'api' }, phase: 'request' },
      }),
    ];

    expect(matchRules(rules, 'https://api.com', 'GET', 'request')).toHaveLength(0);
  });

  it('returns multiple matching rules in order', () => {
    const rules: Rule[] = [
      makeRule({ id: 'a', config: { name: 'first', match: { pattern: 'api' }, phase: 'request' } }),
      makeRule({ id: 'b', config: { name: 'second', match: { pattern: 'api.com' }, phase: 'request' } }),
      makeRule({ id: 'c', config: { name: 'third', match: { pattern: 'other' }, phase: 'request' } }),
    ];

    const matches = matchRules(rules, 'https://api.com/data', 'GET', 'request');
    expect(matches).toHaveLength(2);
    expect(matches[0].id).toBe('a');
    expect(matches[1].id).toBe('b');
  });
});
