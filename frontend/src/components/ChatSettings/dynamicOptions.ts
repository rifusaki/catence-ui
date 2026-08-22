/**
 * Client-side resolution for selects whose options depend on another
 * widget's live value (see chainlit.input_widget.Select.dynamic_options).
 *
 * The backend sends every case up-front; the settings modal resolves the
 * active case from the current form values on each render, so a dependent
 * dropdown updates the moment its sibling changes — no save/reopen needed.
 */

export interface DynamicSelectCase {
  items?: Array<{ label: string; value: string | number }>;
  initialValue?: unknown;
  disabled?: boolean;
  resetValue?: unknown;
}

export interface DynamicOptions {
  watchId?: string;
  cases?: Record<string, DynamicSelectCase | undefined>;
}

type DynamicInput = {
  id?: string;
  dynamicOptions?: DynamicOptions;
};

/** The case matching the watched value, or undefined when none applies. */
function activeCase(
  dynamicOptions: DynamicOptions | undefined,
  formValues: Record<string, unknown>
): DynamicSelectCase | undefined {
  const watchId = dynamicOptions?.watchId;
  const cases = dynamicOptions?.cases;
  if (!watchId || !cases) return undefined;
  const watchedValue = formValues[watchId];
  if (watchedValue === undefined || watchedValue === null) return undefined;
  return cases[String(watchedValue)] ?? cases['*'] ?? undefined;
}

/** Overlay the active case onto the input definition; unchanged when static. */
export function resolveDynamicInput<T extends DynamicInput>(
  input: T,
  formValues: Record<string, unknown>
): T & Pick<DynamicSelectCase, 'items' | 'disabled' | 'resetValue'> {
  const matched = activeCase(input?.dynamicOptions, formValues);
  if (!matched) return { ...input };
  return {
    ...input,
    ...(Array.isArray(matched.items) ? { items: matched.items } : {}),
    ...(matched.disabled !== undefined ? { disabled: matched.disabled } : {}),
    ...(matched.resetValue !== undefined
      ? { resetValue: matched.resetValue }
      : {})
  };
}

/**
 * When the input's current form value is not offered by the active case,
 * return the value it should snap to; otherwise undefined.
 */
export function dependentSnapValue(
  input: DynamicInput & { initial?: unknown },
  formValues: Record<string, unknown>
): unknown {
  const matched = activeCase(input?.dynamicOptions, formValues);
  // Only dynamic cases snap values; a select without an applicable case
  // behaves exactly like a plain static select.
  if (!matched || !Array.isArray(matched.items)) return undefined;
  const validValues = new Set(matched.items.map((item) => String(item.value)));
  const current = input.id ? formValues[input.id] : undefined;
  if (current === undefined || current === null || current === '')
    return undefined;
  if (validValues.has(String(current))) return undefined;
  // An explicit empty case items list means "nothing selectable": snap to
  // null so the placeholder shows instead of an orphaned stale choice.
  return matched.items.length ? (matched.initialValue ?? null) : null;
}
