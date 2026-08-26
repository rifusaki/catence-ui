import { useRecoilState } from 'recoil';

import { useConfig } from '@chainlit/react-client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from '@/components/ui/select';

import { type CotMode, cotOverrideState } from '@/state/cot';

const OPTIONS: { value: CotMode | 'default'; label: string }[] = [
  { value: 'default', label: 'Thinking: Default' },
  { value: 'hidden', label: 'Thinking: Hidden' },
  { value: 'tool_call', label: 'Thinking: Tool calls' },
  { value: 'full', label: 'Thinking: Full' }
];

/**
 * Runtime "Show thinking" control (OpenCode/GLM/Claude-style). Lets the user
 * reveal thinking tokens, tool calls, and chain-of-thought without a config
 * change, so they can tell whether the agent is still thinking or stuck.
 */
export default function ShowThinkingToggle() {
  const { config } = useConfig();
  const [override, setOverride] = useRecoilState(cotOverrideState);
  const configCot: CotMode = (config?.ui?.cot as CotMode) || 'hidden';
  const value = override ?? 'default';
  const selected = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];
  const display =
    selected.value === 'default'
      ? `${selected.label} (${configCot})`
      : selected.label;

  return (
    <Select
      value={value}
      onValueChange={(v) =>
        setOverride(v === 'default' ? undefined : (v as CotMode))
      }
    >
      <SelectTrigger
        aria-label="Show thinking"
        className="h-8 w-auto gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
      >
        {display}
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
            {o.value === 'default' ? ` (${configCot})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
