import cloneDeep from 'lodash/cloneDeep';
import { useEffect, useRef, useState } from 'react';

export interface ChatSettingsSnapshotAtOpen {
  valuesAtOpen: Record<string, unknown>;
  inputsAtOpen: unknown[];
}

type ResettableInput = {
  id?: string;
  inputs?: ResettableInput[];
  initial?: unknown;
  resetValue?: unknown;
};

/** Return configured reset values while preserving fields without an input schema. */
export function configuredChatSettingsDefaults(
  inputs: unknown[],
  currentValues: Record<string, unknown>
): Record<string, unknown> {
  const values = { ...currentValues };
  const applyInput = (input: ResettableInput) => {
    if (Array.isArray(input.inputs)) {
      input.inputs.forEach(applyInput);
      return;
    }
    if (!input.id) return;
    values[input.id] = input.resetValue ?? input.initial;
  };
  inputs.forEach((input) => applyInput(input as ResettableInput));
  return values;
}

/** Snapshots values + input schema when `isOpen` becomes true (cancel support). */
export function useChatSettingsSnapshotAtOpen(
  isOpen: boolean,
  chatSettingsValue: Record<string, unknown>,
  chatSettingsInputs: unknown[]
): ChatSettingsSnapshotAtOpen {
  const [snapshot, setSnapshot] = useState<ChatSettingsSnapshotAtOpen>({
    valuesAtOpen: {},
    inputsAtOpen: []
  });
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      if (!wasOpenRef.current) {
        setSnapshot({
          valuesAtOpen: cloneDeep(chatSettingsValue),
          inputsAtOpen: cloneDeep(chatSettingsInputs)
        });
      }
      wasOpenRef.current = true;
    } else {
      wasOpenRef.current = false;
    }
  }, [isOpen, chatSettingsValue, chatSettingsInputs]);

  return snapshot;
}
