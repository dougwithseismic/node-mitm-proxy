import type { Rule } from './types.js';
import type { ProxyRequest, ProxyResponse, TransformAction } from '../transforms/types.js';

const TRANSFORM_TIMEOUT = 5000;

function isTransformAction(result: unknown): result is TransformAction {
  return (
    typeof result === 'object' &&
    result !== null &&
    'action' in result &&
    typeof (result as TransformAction).action === 'string'
  );
}

async function runWithTimeout<T>(fn: () => Promise<T> | T, timeoutMs: number): Promise<T> {
  return Promise.race([
    Promise.resolve(fn()),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Transform timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}

export interface RequestTransformResult {
  request: ProxyRequest;
  action?: TransformAction;
  modified: boolean;
  appliedRules: string[];
}

export interface ResponseTransformResult {
  response: ProxyResponse;
  action?: TransformAction;
  modified: boolean;
  appliedRules: string[];
}

export async function executeRequestTransforms(
  rules: Rule[],
  request: ProxyRequest,
): Promise<RequestTransformResult> {
  let current = { ...request, headers: { ...request.headers } };
  let modified = false;
  const appliedRules: string[] = [];

  for (const rule of rules) {
    if (!rule.transform?.onRequest) continue;

    try {
      const result = await runWithTimeout(
        () => rule.transform!.onRequest!(current),
        TRANSFORM_TIMEOUT,
      );

      if (isTransformAction(result)) {
        return { request: current, action: result, modified, appliedRules: [...appliedRules, rule.config.name] };
      }

      current = result;
      modified = true;
      appliedRules.push(rule.config.name);
    } catch (err) {
      // Fail-open: log and continue
      console.error(`[rule:${rule.config.name}] Request transform error:`, (err as Error).message);
    }
  }

  return { request: current, modified, appliedRules };
}

export async function executeResponseTransforms(
  rules: Rule[],
  response: ProxyResponse,
  request: ProxyRequest,
): Promise<ResponseTransformResult> {
  let current = { ...response, headers: { ...response.headers } };
  let modified = false;
  const appliedRules: string[] = [];

  for (const rule of rules) {
    if (!rule.transform?.onResponse) continue;

    try {
      const result = await runWithTimeout(
        () => rule.transform!.onResponse!(current, request),
        TRANSFORM_TIMEOUT,
      );

      if (isTransformAction(result)) {
        return { response: current, action: result, modified, appliedRules: [...appliedRules, rule.config.name] };
      }

      current = result;
      modified = true;
      appliedRules.push(rule.config.name);
    } catch (err) {
      console.error(`[rule:${rule.config.name}] Response transform error:`, (err as Error).message);
    }
  }

  return { response: current, modified, appliedRules };
}
