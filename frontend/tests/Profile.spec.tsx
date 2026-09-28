import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Profile from '@/pages/Profile';

vi.mock('pages/Page', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

const roster = {
  defaultAthleteId: 'athlete-1',
  athletes: [{ id: 'athlete-1', label: 'Athlete One' }]
};

const starterFile = {
  exists: false,
  content: '# Starter\n',
  hash: null,
  updatedAt: null,
  revisions: []
};

function respond(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

const fetchMock = vi.fn();

describe('Profile page', () => {
  let putBodies: Array<Record<string, unknown>>;
  let fileResponse: unknown;
  let revisionResponse: { status: number; body: unknown };
  let putResult: (body: Record<string, unknown>) => Response;
  const originalFetch = global.fetch;

  beforeEach(() => {
    putBodies = [];
    fileResponse = starterFile;
    revisionResponse = {
      status: 200,
      body: { revisionId: 'rev-1', content: '' }
    };
    putResult = (body) =>
      respond(200, {
        exists: true,
        content: body.content,
        hash: 'h1',
        updatedAt: '2026-09-27T13:00:00Z'
      });
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/v1/athletes')) return respond(200, roster);
      if (url.includes('revision='))
        return respond(revisionResponse.status, revisionResponse.body);
      if (url.includes('/api/v1/athlete-file') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        putBodies.push(body);
        return putResult(body);
      }
      return respond(200, fileResponse);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates the file with a null expected hash and confirms the save', async () => {
    render(<Profile />);

    expect(await screen.findByText('Starter template')).toBeInTheDocument();
    const editor = (await screen.findByRole('textbox')) as HTMLTextAreaElement;
    expect(editor.value).toBe('# Starter\n');

    fireEvent.change(editor, { target: { value: '# Starter\n\nNotes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create file' }));

    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0]).toEqual({
      content: '# Starter\n\nNotes',
      operation: 'replace',
      expectedHash: null
    });
    expect(await screen.findByText('Saved ✓')).toBeInTheDocument();
    expect(screen.getByText('hash h1')).toBeInTheDocument();
  });

  it('keeps the draft on conflict until the user picks a resolution', async () => {
    fileResponse = {
      exists: true,
      content: 'server version',
      hash: 'h1',
      updatedAt: '2026-09-27T12:00:00Z',
      revisions: []
    };
    putResult = () =>
      respond(409, {
        error: {
          code: 'athlete_file_conflict',
          message: 'Someone saved a newer version.',
          currentHash: 'h2',
          currentContent: 'server version v2'
        }
      });
    render(<Profile />);

    const editor = (await screen.findByRole('textbox')) as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toBe('server version'));

    fireEvent.change(editor, { target: { value: 'my draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Someone saved a newer version.')
    ).toBeInTheDocument();
    expect(editor.value).toBe('my draft');

    fireEvent.click(screen.getByRole('button', { name: 'Keep my draft' }));
    expect(screen.queryByText('Someone saved a newer version.')).toBeNull();
    expect(editor.value).toBe('my draft');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Someone saved a newer version.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load latest' }));

    await waitFor(() => expect(editor.value).toBe('server version v2'));
    expect(screen.queryByText('Someone saved a newer version.')).toBeNull();
  });

  it('previews a revision and restores it into the draft without saving', async () => {
    fileResponse = {
      exists: true,
      content: 'current content',
      hash: 'h2',
      updatedAt: '2026-09-27T12:00:00Z',
      revisions: [
        { revisionId: 'rev-1', hash: 'h0', savedAt: '2026-09-26T12:00:00Z' }
      ]
    };
    revisionResponse = {
      status: 200,
      body: { revisionId: 'rev-1', content: 'older content' }
    };
    render(<Profile />);

    fireEvent.click(await screen.findByRole('button', { name: 'View' }));
    expect(await screen.findByText('older content')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Restore as draft' }));

    const editor = screen.getByRole('textbox') as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toBe('older content'));
    expect(
      screen.queryByRole('button', { name: 'Restore as draft' })
    ).toBeNull();
    expect(putBodies).toHaveLength(0);
  });

  it('shows a friendly message when a revision is gone', async () => {
    fileResponse = {
      exists: true,
      content: 'current content',
      hash: 'h2',
      updatedAt: '2026-09-27T12:00:00Z',
      revisions: [
        { revisionId: 'rev-1', hash: 'h0', savedAt: '2026-09-26T12:00:00Z' }
      ]
    };
    revisionResponse = {
      status: 404,
      body: {
        error: {
          code: 'athlete_file_revision_not_found',
          message: 'revision missing'
        }
      }
    };
    render(<Profile />);

    fireEvent.click(await screen.findByRole('button', { name: 'View' }));
    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument();
  });
});
