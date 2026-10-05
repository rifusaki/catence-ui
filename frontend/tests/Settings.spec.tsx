import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Settings from '@/pages/Settings';

vi.mock('pages/Page', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

vi.mock('pages/Profile', () => ({
  ProfileContent: () => <div>profile tab</div>
}));
vi.mock('pages/Status', () => ({
  StatusContent: () => <div>status tab</div>
}));
vi.mock('pages/Models', () => ({
  ModelsContent: () => <div>models tab</div>
}));
vi.mock('pages/Accounts', () => ({
  AccountsContent: () => <div>accounts tab</div>
}));

const { whoamiMock } = vi.hoisted(() => ({ whoamiMock: vi.fn() }));
vi.mock('@/hooks/useWhoami', () => ({ useWhoami: whoamiMock }));

const roster = {
  defaultAthleteId: 'athlete-1',
  athletes: [{ id: 'athlete-1', label: 'Athlete One' }]
};

function respond(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

const fetchMock = vi.fn();

describe('Settings page', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => respond(404, {}));
    global.fetch = fetchMock as unknown as typeof fetch;
    whoamiMock.mockReset();
    whoamiMock.mockReturnValue({
      username: 'bob',
      role: 'member',
      athletes: ['athlete-1']
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('shows members only their own tabs and falls back from admin URLs', () => {
    render(
      <MemoryRouter initialEntries={['/settings?tab=accounts']}>
        <Settings />
      </MemoryRouter>
    );

    expect(screen.getByRole('tab', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Status' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Models' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Athletes' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Accounts' })).toBeNull();
    expect(screen.getByText('profile tab')).toBeInTheDocument();
  });

  it('shows administrators every tab', () => {
    whoamiMock.mockReturnValue({
      username: 'ana',
      role: 'admin',
      athletes: 'all'
    });
    render(
      <MemoryRouter initialEntries={['/settings?tab=accounts']}>
        <Settings />
      </MemoryRouter>
    );

    for (const name of [
      'Profile',
      'Status',
      'Models',
      'Athletes',
      'Accounts'
    ]) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
    expect(screen.getByText('accounts tab')).toBeInTheDocument();
  });

  it('hides inactive tab panels so they cannot steal the layout', () => {
    whoamiMock.mockReturnValue({
      username: 'ana',
      role: 'admin',
      athletes: 'all'
    });
    render(
      <MemoryRouter initialEntries={['/settings?tab=status']}>
        <Settings />
      </MemoryRouter>
    );

    const active = screen.getByRole('tabpanel', { name: 'Status' });
    const panels = screen.getAllByRole('tabpanel', { hidden: true });
    expect(panels).toHaveLength(5);
    expect(active).toHaveClass('data-[state=active]:flex');
    for (const panel of panels) {
      if (panel === active) continue;
      expect(panel).toHaveAttribute('hidden');
      expect(panel).toHaveClass('data-[state=inactive]:hidden');
    }
  });

  it('adds an athlete from the Athletes tab', async () => {
    whoamiMock.mockReturnValue({
      username: 'ana',
      role: 'admin',
      athletes: 'all'
    });
    const posted: Array<Record<string, unknown>> = [];
    let rosterCalls = 0;
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v1/athletes') && init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return respond(201, {
          defaultAthleteId: 'athlete-2',
          athletes: [
            ...roster.athletes,
            { id: 'athlete-2', label: 'Athlete Two' }
          ]
        });
      }
      if (url.endsWith('/api/v1/athletes')) {
        rosterCalls += 1;
        return respond(
          200,
          rosterCalls === 1
            ? roster
            : {
                ...roster,
                athletes: [
                  ...roster.athletes,
                  { id: 'athlete-2', label: 'Athlete Two' }
                ]
              }
        );
      }
      return respond(404, {});
    });

    render(
      <MemoryRouter initialEntries={['/settings?tab=athletes']}>
        <Settings />
      </MemoryRouter>
    );

    expect(await screen.findByText('Athlete One')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Athlete id'), {
      target: { value: 'athlete-2' }
    });
    fireEvent.change(screen.getByLabelText('Display name'), {
      target: { value: 'Athlete Two' }
    });
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Set as the default athlete' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add athlete' }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({
      id: 'athlete-2',
      label: 'Athlete Two',
      setDefault: true
    });
    expect(await screen.findByText('Added Athlete Two.')).toBeInTheDocument();
    await waitFor(() => expect(rosterCalls).toBe(2));
    expect(await screen.findByText('athlete-2')).toBeInTheDocument();
  });

  it('surfaces athlete creation failures', async () => {
    whoamiMock.mockReturnValue({
      username: 'ana',
      role: 'admin',
      athletes: 'all'
    });
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v1/athletes') && init?.method === 'POST') {
        return respond(409, { error: { code: 'athlete_exists' } });
      }
      if (url.endsWith('/api/v1/athletes')) {
        return respond(200, roster);
      }
      return respond(404, {});
    });

    render(
      <MemoryRouter initialEntries={['/settings?tab=athletes']}>
        <Settings />
      </MemoryRouter>
    );

    await screen.findByText('Athlete One');
    fireEvent.change(screen.getByLabelText('Athlete id'), {
      target: { value: 'athlete-1' }
    });
    fireEvent.change(screen.getByLabelText('Display name'), {
      target: { value: 'Athlete One' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add athlete' }));

    expect(
      await screen.findByText('That athlete id already exists.')
    ).toBeInTheDocument();
  });
});
