import { useId } from 'react';
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Text, ToggleGroup, ToggleGroupItem } from '@gears-frontx/ui-kit';

import type { DashboardVariable } from '../contract';
import type { VariableValues } from '../runtime/binding';
import styles from './VariablesBar.module.css';

/** Up to this many options a variable shows as a toggle group; more show as a select. */
const TOGGLE_MAX = 5;

/**
 * The dashboard's variable controls above the grid, one per variable in declaration order. Every text comes from the
 * dashboard: the variable's title is the control's visible label and accessible name, each option's label its text.
 */
export function VariablesBar({
  variables,
  values,
  onChange,
  container,
}: {
  variables: Record<string, DashboardVariable>;
  values: VariableValues;
  onChange: (name: string, value: string) => void;
  /** Where a select's popup goes, so it draws in the dashboard's theme scope. */
  container?: HTMLElement | null;
}) {
  return (
    <div className={styles.bar}>
      {Object.entries(variables).map(([name, variable]) => (
        <VariableControl key={name} variable={variable} value={values[name] ?? variable.default} onChange={(value) => onChange(name, value)} container={container} />
      ))}
    </div>
  );
}

function VariableControl({
  variable,
  value,
  onChange,
  container,
}: {
  variable: DashboardVariable;
  value: string;
  onChange: (value: string) => void;
  container?: HTMLElement | null;
}) {
  const id = useId();
  if (variable.options.length <= TOGGLE_MAX) {
    return (
      <div className={styles.control}>
        <Text typography="label" tone="muted" render={<span id={id} />}>
          {variable.title}
        </Text>
        <ToggleGroup
          aria-labelledby={id}
          size="sm"
          spacing={0}
          value={[value]}
          // Single selection: pressing the selected option again keeps it.
          onValueChange={(next: string[]) => next[0] !== undefined && next[0] !== value && onChange(next[0])}
        >
          {variable.options.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    );
  }
  const items = Object.fromEntries(variable.options.map((option) => [option.value, option.label]));
  return (
    <div className={styles.control}>
      <Label htmlFor={id}>{variable.title}</Label>
      <Select items={items} value={value} onValueChange={(next: string | null) => next !== null && next !== value && onChange(next)}>
        <SelectTrigger id={id} size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent container={container}>
          {variable.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
