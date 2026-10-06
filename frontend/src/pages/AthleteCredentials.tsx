import { useEffect, useMemo, useState } from 'react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

import {
  type AthleteOption,
  type AthleteSecretProvider,
  type AthleteSecretsSnapshot,
  loadAthleteSecrets,
  removeAthleteSecret,
  setAthleteSecret
} from './accountsApi';

const apiOrigin = (
  import.meta.env.VITE_CATENCE_API_ORIGIN || window.location.origin
).replace(/\/$/, '');

type PendingRemoval = { provider: AthleteSecretProvider; field: string };

/**
 * Admin dialog for one athlete's provider credentials. Values are write-only:
 * the runtime returns only field names and configured flags, so inputs are
 * never prefilled and are cleared after every save.
 */
export function AthleteCredentialsDialog({
  athlete,
  onClose
}: {
  athlete: AthleteOption;
  onClose: () => void;
}) {
  const [snapshot, setSnapshot] = useState<AthleteSecretsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<PendingRemoval | null>(null);

  useEffect(() => {
    let active = true;
    setSnapshot(null);
    setError(null);
    setNotice(null);
    setDrafts({});
    void (async () => {
      const outcome = await loadAthleteSecrets(apiOrigin, athlete.id);
      if (!active) return;
      if (outcome.ok) setSnapshot(outcome.data);
      else setError(outcome.failure.message);
    })();
    return () => {
      active = false;
    };
  }, [athlete.id]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const draftKey = (providerId: string, field: string) =>
    `${providerId}.${field}`;

  const save = async (provider: AthleteSecretProvider, field: string) => {
    const key = draftKey(provider.id, field);
    const value = (drafts[key] ?? '').trim();
    if (!value || busyKey) return;
    setBusyKey(key);
    setError(null);
    const outcome = await setAthleteSecret(apiOrigin, {
      athleteId: athlete.id,
      provider: provider.id,
      field,
      value
    });
    setBusyKey(null);
    if (!outcome.ok) {
      setError(outcome.failure.message);
      return;
    }
    setSnapshot(outcome.data);
    setDrafts((current) => ({ ...current, [key]: '' }));
    setNotice(`Saved ${provider.label} ${field}.`);
  };

  const remove = async () => {
    if (!confirming || busyKey) return;
    const { provider, field } = confirming;
    setBusyKey(draftKey(provider.id, field));
    setError(null);
    const outcome = await removeAthleteSecret(apiOrigin, {
      athleteId: athlete.id,
      provider: provider.id,
      field
    });
    setBusyKey(null);
    setConfirming(null);
    if (!outcome.ok) {
      setError(outcome.failure.message);
      return;
    }
    setSnapshot(outcome.data);
    setNotice(`Removed ${provider.label} ${field}.`);
  };

  const providers = useMemo(() => snapshot?.providers ?? [], [snapshot]);

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Credentials — {athlete.label}</DialogTitle>
            <DialogDescription>
              Provider values are write-only: replace or remove them here, but
              they can never be read back.
            </DialogDescription>
          </DialogHeader>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {notice ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              {notice}
            </p>
          ) : null}

          {!snapshot && !error ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            providers.map((provider) => (
              <section key={provider.id} className="grid gap-2">
                <h3 className="text-sm font-medium">{provider.label}</h3>
                {provider.fields.map((field) => {
                  const key = draftKey(provider.id, field.name);
                  const busy = busyKey === key;
                  return (
                    <div
                      key={field.name}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Label
                        htmlFor={key}
                        className="w-28 shrink-0 font-mono text-xs text-muted-foreground"
                      >
                        {field.name}
                      </Label>
                      <Badge
                        variant={field.configured ? 'secondary' : 'outline'}
                      >
                        {field.configured ? 'Configured' : 'Not set'}
                      </Badge>
                      <Input
                        id={key}
                        type="password"
                        autoComplete="new-password"
                        placeholder={field.configured ? 'New value' : 'Value'}
                        className="flex-1"
                        value={drafts[key] ?? ''}
                        disabled={busyKey !== null}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [key]: event.target.value
                          }))
                        }
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          busyKey !== null || !(drafts[key] ?? '').trim()
                        }
                        onClick={() => void save(provider, field.name)}
                      >
                        {busy ? 'Saving…' : 'Save'}
                      </Button>
                      {field.configured ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyKey !== null}
                          onClick={() =>
                            setConfirming({ provider, field: field.name })
                          }
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </section>
            ))
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove credential?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming
                ? `The ${confirming.provider.label} ${confirming.field} value will be deleted. Providers stop working until it is set again.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void remove()}
            >
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
