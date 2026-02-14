import { minimatch } from 'minimatch';
import type { Rule, RulePhase } from './types.js';

function matchesPattern(url: string, pattern: string, type: string = 'substring'): boolean {
  switch (type) {
    case 'regex':
      try {
        return new RegExp(pattern).test(url);
      } catch {
        return false;
      }
    case 'glob':
      return minimatch(url, pattern);
    case 'substring':
    default:
      return url.includes(pattern);
  }
}

function matchesMethod(method: string, methods?: string[]): boolean {
  if (!methods || methods.length === 0) return true;
  return methods.some((m) => m.toUpperCase() === method.toUpperCase());
}

export function matchRules(
  rules: Rule[],
  url: string,
  method: string,
  phase: RulePhase,
): Rule[] {
  return rules.filter((rule) => {
    if (!rule.enabled) return false;
    if (rule.config.phase !== phase) return false;
    if (!matchesMethod(method, rule.config.match.methods)) return false;
    return matchesPattern(url, rule.config.match.pattern, rule.config.match.type);
  });
}
