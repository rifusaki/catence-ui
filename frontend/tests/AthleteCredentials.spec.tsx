import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AthleteCredentialsDialog } from '@/pages/AthleteCredentials';

function respond(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

const athlete = { id: 'athlete-1', label: 'Athlete One' };

function metadata(configured: { email: boolean; password: boolean }) {
  return {
    athleteId: 'athlete-1',
    providers: [
      {
        id: 'garmin',
        label: 'Garmin',
        fields: [
          { name: 'email', configured: configured.email },
          { name: 'password', configured: configured.password }
        ]
      }
    ]
  };
}

const fetchMock = vi.fn();
const originalFetch = global.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('AthleteCredentialsDialog', () => {
  it('saves a replacement value without ever prefilling it', async () => {
    const puts: Array<Record<string, unknown>> = [];
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/v1/athlete-secrets') && init?.method === 'PUT') {
        puts.push(JSON.parse(String(init.body)));
        return respond(200, metadata({ email: true, password: true }));
      }
      if (url.includes('/api/v1/athlete-secrets')) {
        return respond(200, metadata({ email: true, password: true }));
      }
      return respond(404, {});
    });

    render(<AthleteCredentialsDialog athlete={athlete} onClose={() => {}} />);

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Garmin')).toBeInTheDocument();

    const input = within(dialog).getByLabelText('email') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.type).toBe('password');

    fireEvent.change(input, { target: { value: 'new@example.test' } });
    fireEvent.click(
      within(input.closest('div') as HTMLElement).getByRole('button', {
        name: 'Save'
      })
    );

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      athleteId: 'athlete-1',
      provider: 'garmin',
      field: 'email',
      value: 'new@example.test'
    });
    expect(
      await within(dialog).findByText('Saved Garmin email.')
    ).toBeInTheDocument();
    expect(
      (within(dialog).getByLabelText('email') as HTMLInputElement).value
    ).toBe('');
  });

  it('removes a configured credential only after confirmation', async () => {
    const removals: Array<Record<string, unknown>> = [];
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v1/athlete-secrets/remove')) {
        removals.push(JSON.parse(String(init.body)));
        return respond(200, metadata({ email: true, password: false }));
      }
      if (url.includes('/api/v1/athlete-secrets')) {
        return respond(200, metadata({ email: true, password: true }));
      }
      return respond(404, {});
    });

    render(<AthleteCredentialsDialog athlete={athlete} onClose={() => {}} />);

    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Garmin');

    const passwordInput = within(dialog).getByLabelText('password');
    const passwordRow = passwordInput.closest('div') as HTMLElement;
    fireEvent.click(
      within(passwordRow).getByRole('button', { name: 'Remove' })
    );

    const alert = screen.getByRole('alertdialog');
    expect(alert).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(removals).toHaveLength(1));
    expect(removals[0]).toEqual({
      athleteId: 'athlete-1',
      provider: 'garmin',
      field: 'password'
    });
    expect(
      await within(dialog).findByText('Removed Garmin password.')
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(passwordRow).getByText('Not set')).toBeInTheDocument()
    );
  });
});
