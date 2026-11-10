import { Environment } from '@marcbachmann/cel-js';

/*
 * The binding runner's internal interface to the CEL library (DESIGN §3.3):
 * parse, check, evaluate, convert to JSON. The rest of the root never imports
 * the library, so it can be swapped in this one module.
 */

const env = new Environment({ unlistedVariablesAreDyn: true, homogeneousAggregateLiterals: false });

export interface Transform {
  /** Evaluates on the given variables only; an undeclared identifier fails with an unknown-variable error. */
  evaluate(variables: Record<string, unknown>): unknown;
}

/** Parses and checks a transform; throws before anything runs when it does not parse or check. */
export function compileTransform(expression: string): Transform {
  const checked = env.check(expression) as { valid: boolean; error?: unknown };
  if (!checked.valid) throw checked.error instanceof Error ? checked.error : new Error(`transform does not check: ${String(checked.error)}`);
  const program = env.parse(expression);
  return { evaluate: (variables) => toJson(program(variables)) };
}

/** CEL values as JSON: integers come back as bigint, maps may come back as Map. */
export function toJson(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Map) return Object.fromEntries([...value].map(([key, item]) => [String(key), toJson(item)]));
  if (Array.isArray(value)) return value.map(toJson);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJson(item)]));
  return value;
}
