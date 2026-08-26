import { render, screen } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { expect, it, vi } from 'vitest';

import ShowThinkingToggle from 'components/chat/ShowThinkingToggle';

// `useConfig` is the only react-client symbol this component consumes; mock it
// so we can render without the full Chainlit provider tree. A single hoisted
// mock reads a mutable value so each test can vary the server `ui.cot`.
let configCot: 'hidden' | 'tool_call' | 'full' | undefined = 'full';
vi.mock('@chainlit/react-client', () => ({
  useConfig: () => ({ config: { ui: { cot: configCot } } })
}));

it('mounts and shows the config default in the Show thinking control', () => {
  configCot = 'full';
  render(
    <RecoilRoot>
      <ShowThinkingToggle />
    </RecoilRoot>
  );

  const trigger = screen.getByRole('combobox', { name: 'Show thinking' });
  expect(trigger).toHaveTextContent('Thinking: Default (full)');
});

it('falls back to "hidden" label when config omits ui.cot', () => {
  configCot = undefined;
  render(
    <RecoilRoot>
      <ShowThinkingToggle />
    </RecoilRoot>
  );

  const trigger = screen.getByRole('combobox', { name: 'Show thinking' });
  expect(trigger).toHaveTextContent('Thinking: Default (hidden)');
});
