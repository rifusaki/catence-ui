import { useEffect, useRef, useState } from 'react';

import Page from 'pages/Page';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

import {
  type AthleteFileConflict,
  type AthleteFileRevision,
  type AthleteFileSnapshot,
  type AthleteRoster,
  formatTimestamp,
  loadAthleteFile,
  loadAthleteFileRevision,
  loadAthleteRoster,
  mergeWriteResponse,
  saveAthleteFile,
  selectDefaultAthleteId,
  shortHash,
  snapshotFromConflict,
  sortRevisionsNewestFirst,
  withSignal
} from './profileFile';

const apiOrigin = (
  import.meta.env.VITE_CATENCE_API_ORIGIN || window.location.origin
).replace(/\/$/, '');

type RevisionPreview =
  | { status: 'loading'; revision: AthleteFileRevision }
  | { status: 'ready'; revision: AthleteFileRevision; content: string }
  | { status: 'error'; revision: AthleteFileRevision; message: string };

function ProfileContent() {
  const [roster, setRoster] = useState<AthleteRoster | null>(null);
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [athleteId, setAthleteId] = useState<string | null>(null);

  const [file, setFile] = useState<AthleteFileSnapshot | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [conflict, setConflict] = useState<AthleteFileConflict | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<RevisionPreview | null>(null);

  const selectedAthleteRef = useRef<string | null>(null);
  useEffect(() => {
    selectedAthleteRef.current = athleteId;
  }, [athleteId]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const nextRoster = await loadAthleteRoster(
          apiOrigin,
          withSignal(controller.signal)
        );
        if (!nextRoster) return;
        setRoster(nextRoster);
        setAthleteId(selectDefaultAthleteId(nextRoster));
      } catch (caught) {
        if ((caught as DOMException).name !== 'AbortError')
          setRosterError(
            caught instanceof Error ? caught.message : String(caught)
          );
      } finally {
        setRosterLoaded(true);
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!athleteId) return;
    const controller = new AbortController();
    setFile(null);
    setFileError(null);
    setDraft('');
    setConflict(null);
    setPreview(null);
    setNotice(null);
    setSaving(false);
    void (async () => {
      try {
        const snapshot = await loadAthleteFile(
          apiOrigin,
          athleteId,
          withSignal(controller.signal)
        );
        setFile(snapshot);
        setDraft(snapshot.content);
      } catch (caught) {
        if ((caught as DOMException).name !== 'AbortError')
          setFileError(
            caught instanceof Error ? caught.message : String(caught)
          );
      }
    })();
    return () => controller.abort();
  }, [athleteId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const updateDraft = (value: string) => {
    setDraft(value);
    setNotice(null);
  };

  const refreshRevisions = async (requestAthleteId: string) => {
    try {
      const fresh = await loadAthleteFile(apiOrigin, requestAthleteId);
      if (selectedAthleteRef.current !== requestAthleteId) return;
      setFile((current) =>
        current ? { ...current, revisions: fresh.revisions } : current
      );
    } catch {
      // Best-effort: the save already succeeded and the list refreshes on reload.
    }
  };

  const save = async () => {
    if (!athleteId || !file) return;
    const requestAthleteId = athleteId;
    setSaving(true);
    setNotice(null);
    setFileError(null);
    const outcome = await saveAthleteFile(
      apiOrigin,
      requestAthleteId,
      draft,
      file.exists ? file.hash : null
    );
    if (selectedAthleteRef.current !== requestAthleteId) return;
    setSaving(false);
    if (outcome.kind === 'saved') {
      setFile((current) =>
        current ? mergeWriteResponse(current, outcome.response) : current
      );
      setDraft(outcome.response.content);
      setConflict(null);
      setNotice('Saved ✓');
      void refreshRevisions(requestAthleteId);
    } else if (outcome.kind === 'conflict') {
      setConflict(outcome.conflict);
    } else {
      setFileError(outcome.message);
    }
  };

  const viewRevision = async (revision: AthleteFileRevision) => {
    if (!athleteId) return;
    const requestAthleteId = athleteId;
    setPreview({ status: 'loading', revision });
    try {
      const loaded = await loadAthleteFileRevision(
        apiOrigin,
        requestAthleteId,
        revision.revisionId
      );
      if (selectedAthleteRef.current !== requestAthleteId) return;
      setPreview((current) =>
        current?.revision.revisionId === revision.revisionId
          ? { status: 'ready', revision, content: loaded.content }
          : current
      );
    } catch (caught) {
      if (selectedAthleteRef.current !== requestAthleteId) return;
      setPreview((current) =>
        current?.revision.revisionId === revision.revisionId
          ? {
              status: 'error',
              revision,
              message: caught instanceof Error ? caught.message : String(caught)
            }
          : current
      );
    }
  };

  const applyLatest = () => {
    if (!file || !conflict) return;
    setFile(snapshotFromConflict(file, conflict));
    setDraft(conflict.currentContent);
    setConflict(null);
    setNotice('Loaded the latest server version.');
  };

  const restoreAsDraft = (revision: AthleteFileRevision, content: string) => {
    setDraft(content);
    setPreview(null);
    setNotice(
      `Revision from ${formatTimestamp(revision.savedAt)} copied into the editor — save to keep it.`
    );
  };

  if (!rosterLoaded) {
    return (
      <main className="flex flex-1 flex-col gap-6 overflow-auto p-6">
        <Skeleton className="h-12 w-56" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }
  if (rosterError && !roster) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-sm text-destructive">
        {rosterError}
      </main>
    );
  }

  const selectedAthlete =
    roster?.athletes.find((athlete) => athlete.id === athleteId) ?? null;
  const dirty = file !== null && draft !== file.content;
  const revisions = file ? sortRevisionsNewestFirst(file.revisions) : [];

  return (
    <main className="flex flex-1 flex-col gap-6 overflow-auto p-6">
      <div>
        <h1 className="text-2xl font-semibold">Athlete file</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The shared athlete file — a markdown document you and the Catence
          agent read and edit together. Every save is versioned, so earlier
          revisions can be reviewed and restored.
        </p>
        {roster && roster.athletes.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <label className="flex w-fit items-center gap-2">
              Athlete
              <select
                className="rounded-md border bg-background px-2 py-1 text-foreground"
                value={athleteId ?? ''}
                onChange={(event) => setAthleteId(event.target.value)}
              >
                {roster.athletes.map((athlete) => (
                  <option key={athlete.id} value={athlete.id}>
                    {athlete.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </div>

      {roster && roster.athletes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No athletes are configured on this server yet — add one to start a
          shared athlete file.
        </p>
      ) : null}

      {!roster && !rosterError ? (
        <p className="text-sm text-muted-foreground">
          This server does not expose an athlete roster, so there is no athlete
          file to edit here.
        </p>
      ) : null}

      {athleteId && !file && !fileError ? (
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      ) : null}

      {athleteId && !file && fileError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {fileError}
        </div>
      ) : null}

      {athleteId && file ? (
        <>
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="text-sm">
                  <div className="font-medium">
                    {file.exists ? 'Saved document' : 'Starter template'}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {file.exists
                      ? file.updatedAt
                        ? `Updated ${formatTimestamp(file.updatedAt)}`
                        : 'Update time unavailable'
                      : 'Not saved yet — saving creates the file for this athlete.'}
                    <span className="ml-2 font-mono">
                      hash {shortHash(file.hash)}
                    </span>
                    {dirty ? (
                      <span className="ml-2 text-amber-600 dark:text-amber-400">
                        unsaved changes
                      </span>
                    ) : null}
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={saving}
                  aria-busy={saving}
                  onClick={() => void save()}
                >
                  {saving ? 'Saving…' : file.exists ? 'Save' : 'Create file'}
                </Button>
              </div>

              <Textarea
                aria-label="Athlete file content"
                spellCheck={false}
                className="min-h-[50vh] font-mono text-sm"
                value={draft}
                onChange={(event) => updateDraft(event.target.value)}
              />

              {fileError ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {fileError}
                </div>
              ) : null}
              {notice ? (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
                  {notice}
                </div>
              ) : null}
              {conflict ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
                  <p className="font-medium">
                    This file changed on the server.
                  </p>
                  <p className="mt-1">{conflict.message}</p>
                  <p className="mt-1 text-xs">
                    Your draft is untouched here. The server version is{' '}
                    <span className="font-mono">
                      {shortHash(conflict.currentHash)}
                    </span>
                    .
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={applyLatest}>
                      Load latest
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConflict(null)}
                    >
                      Keep my draft
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {preview ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">
                  Revision from {formatTimestamp(preview.revision.savedAt)}
                </CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPreview(null)}
                >
                  Close
                </Button>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="font-mono text-xs text-muted-foreground">
                  {preview.revision.revisionId} · hash{' '}
                  {shortHash(preview.revision.hash)}
                </p>
                {preview.status === 'loading' ? (
                  <Skeleton className="h-40 w-full" />
                ) : preview.status === 'error' ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {preview.message}
                  </div>
                ) : (
                  <>
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 font-mono text-sm">
                      {preview.content}
                    </pre>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          restoreAsDraft(preview.revision, preview.content)
                        }
                      >
                        Restore as draft
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Copies into the editor without saving.
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base">Revisions</CardTitle>
              <span className="text-xs text-muted-foreground">
                {revisions.length
                  ? `${revisions.length} saved`
                  : 'No history yet'}
              </span>
            </CardHeader>
            <CardContent>
              {revisions.length ? (
                <ul className="divide-y">
                  {revisions.map((revision) => (
                    <li
                      key={revision.revisionId}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <div className="text-sm">
                        <div className="font-medium">
                          {formatTimestamp(revision.savedAt)}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {revision.revisionId} · hash{' '}
                          {shortHash(revision.hash)}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void viewRevision(revision)}
                      >
                        View
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {file.exists
                    ? 'No revisions recorded yet.'
                    : 'Saving this file records its first revision.'}
                </p>
              )}
            </CardContent>
          </Card>

          <p className="pb-4 text-xs text-muted-foreground">
            {selectedAthlete
              ? `Shared with the Catence agent as ${selectedAthlete.label}'s athlete file.`
              : 'Shared with the Catence agent.'}{' '}
            Loading a revision does not change the file until you restore it as
            a draft and save.
          </p>
        </>
      ) : null}
    </main>
  );
}

export default function Profile() {
  return (
    <Page>
      <ProfileContent />
    </Page>
  );
}
