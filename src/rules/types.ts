import type { TransformModule } from '../transforms/types.js';

export type MatchType = 'substring' | 'regex' | 'glob';
export type RulePhase = 'request' | 'response';
export type RuleSource = 'file' | 'api';

export interface RuleMatch {
  pattern: string;
  type?: MatchType;
  methods?: string[];
}

export interface RuleConfig {
  name: string;
  match: RuleMatch;
  phase: RulePhase;
  transform?: string;
  enabled?: boolean;
}

export interface Rule {
  id: string;
  source: RuleSource;
  config: RuleConfig;
  transform?: TransformModule;
  filePath?: string;
  enabled: boolean;
  error?: string;
}
