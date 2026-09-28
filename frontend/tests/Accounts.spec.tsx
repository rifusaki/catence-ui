import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Accounts from '@/pages/Accounts';

vi.mock('pages/Page', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

const roster = {
  defaultAthleteId: 'athlete-1',
  athletes: [
    { id: 'athlete-1', label: 'Athlete One' },
    { id: 'athlete-2', label: 'Athlete Two' }
  ]
};

const accountsSnapshot = {
  accounts: [
    {
      username: 'ana',
      role: 'admin',
      athletes: 'all',
      createdAt: '2026-09-01T12:00:00Z'
    },
    {
      username: 'bob',
      role: 'member',
      athletes: ['athlete-1'],
      createdAt: '2026-09-02T12:00:00Z'
    }
  ],
  breakGlass: { username: 'root' }
};

const toolServersSnapshot = {
  servers: [
    {
      name: 'exa',
      label: 'Exa Web Search',
      url: 'https://mcp.exa.ai/mcp',
      secrets: [{ name: 'EXA_API_KEY', configured: false, source: null }]
    }
  ]
};

const savedToolServersSnapshot = {
  servers: [
    {
      name: 'exa',
      label: 'Exa Web Search',
      url: 'https://mcp.exa.ai/mcp',
      secrets: [{ name: 'EXA_API_KEY', configured: true, source: 'console' }]
    }
  ]
};

function respond(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

const fetchMock = vi.fn();

describe('Accounts page', () => {
  let accountsResponse: { status: number; body: unknown };
  let addResponse: { status: number; body: unknown };
  let removeResponse: { status: number; body: unknown };
  let rosterResponse: { status: number; body: unknown };
  let toolServersResponse: { status: number; body: unknown };
  let addedBodies: Array<Record<string, unknown>>;
  let removedBodies: Array<Record<string, unknown>>;
  let secretBodies: Array<Record<string, unknown>>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    accountsResponse = { status: 200, body: accountsSnapshot };
    addResponse = { status: 200, body: {} };
    removeResponse = { status: 200, body: {} };
    rosterResponse = { status: 200, body: roster };
    toolServersResponse = { status: 200, body: toolServersSnapshot };
    addedBodies = [];
    removedBodies = [];
    secretBodies = [];
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/v1/accounts/add')) {
        addedBodies.push(
          JSON.parse(String(init?.body)) as Record<string, unknown>
        );
        return respond(addResponse.status, addResponse.body);
      }
      if (url.includes('/api/v1/accounts/remove')) {
        removedBodies.push(
          JSON.parse(String(init?.body)) as Record<string, unknown>
        );
        return respond(removeResponse.status, removeResponse.body);
      }
      if (url.includes('/api/v1/accounts'))
        return respond(accountsResponse.status, accountsResponse.body);
      if (url.includes('/api/v1/athletes'))
        return respond(rosterResponse.status, rosterResponse.body);
      if (url.includes('/api/v1/tool-servers/exa/secrets')) {
        secretBodies.push(
          JSON.parse(String(init?.body)) as Record<string, unknown>
        );
        return respond(200, savedToolServersSnapshot);
      }
      if (url.includes('/api/v1/tool-servers'))
        return respond(toolServersResponse.status, toolServersResponse.body);
      return respond(404, {});
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('shows the no-access state to members', async () => {
    accountsResponse = {
      status: 403,
      body: { error: { code: 'admin_required', message: 'admin required' } }
    };
    render(<Accounts />);

    expect(
      await screen.findByText('Administrator access required')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add account' })).toBeNull();
  });

  it('lists accounts and the environment break-glass row', async () => {
    render(<Accounts />);

    expect(await screen.findByText('ana')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('root')).toBeInTheDocument();
    expect(screen.getByText('break-glass admin')).toBeInTheDocument();
    expect(screen.getByText('environment')).toBeInTheDocument();
    expect(screen.getByText('athlete-1')).toBeInTheDocument();
    expect(screen.getAllByText('all').length).toBeGreaterThan(0);
  });

  it('adds an account with the selected athlete grant', async () => {
    render(<Accounts />);
    await screen.findByText('ana');

    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText('Username'), {
      target: { value: 'carol' }
    });
    fireEvent.change(within(dialog).getByLabelText('Password'), {
      target: { value: 'correct horse' }
    });
    fireEvent.click(
      within(dialog).getByRole('checkbox', { name: 'Athlete Two' })
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Create account' })
    );

    await waitFor(() => expect(addedBodies).toHaveLength(1));
    expect(addedBodies[0]).toEqual({
      username: 'carol',
      password: 'correct horse',
      role: 'member',
      athletes: ['athlete-2']
    });
    expect(await screen.findByText('Added carol.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('surfaces the last_admin error when removing the final admin', async () => {
    removeResponse = { status: 400, body: { error: { code: 'last_admin' } } };
    render(<Accounts />);
    await screen.findByText('ana');

    const anaRow = screen.getByText('ana').closest('tr');
    expect(anaRow).not.toBeNull();
    fireEvent.click(
      within(anaRow as HTMLElement).getByRole('button', { name: 'Remove' })
    );

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Remove account' })
    );

    await waitFor(() => expect(removedBodies).toHaveLength(1));
    expect(removedBodies[0]).toEqual({ username: 'ana' });
    expect(await within(dialog).findByText(/last admin/i)).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('renders a friendly empty-roster state instead of an error', async () => {
    rosterResponse = {
      status: 200,
      body: { defaultAthleteId: '', athletes: [] }
    };
    render(<Accounts />);

    expect(await screen.findByText('ana')).toBeInTheDocument();
    expect(screen.getByText(/no athlete access yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/invalid athlete roster/i)).toBeNull();
  });

  it('shows tool-server credential readiness and saves a value', async () => {
    render(<Accounts />);
    await screen.findByText('Exa Web Search');

    expect(screen.getByText('exa')).toBeInTheDocument();
    expect(screen.getByText('not set')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('EXA_API_KEY value'), {
      target: { value: 'exa-secret-value' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(secretBodies).toHaveLength(1));
    expect(secretBodies[0]).toEqual({
      name: 'EXA_API_KEY',
      value: 'exa-secret-value'
    });
    expect(await screen.findByText('saved here')).toBeInTheDocument();
    expect(
      screen.getByText('Saved EXA_API_KEY for Exa Web Search.')
    ).toBeInTheDocument();
  });

  it('renders the empty tool-server state when none are configured', async () => {
    toolServersResponse = { status: 200, body: { servers: [] } };
    render(<Accounts />);

    expect(
      await screen.findByText(/no extra tool servers are configured/i)
    ).toBeInTheDocument();
  });
});
