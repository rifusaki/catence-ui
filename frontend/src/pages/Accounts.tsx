import { useEffect, useState } from 'react';

import Page from 'pages/Page';

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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
  type Account,
  type AccountRole,
  type AccountsFailure,
  type AccountsSnapshot,
  type AthleteGrant,
  type AthleteOption,
  addAccount,
  formatAthleteGrant,
  loadAccounts,
  loadAthleteOptions,
  removeAccount,
  resetAccountPassword,
  updateAccountGrants
} from './accountsApi';
import { formatTimestamp, withSignal } from './profileFile';

const apiOrigin = (
  import.meta.env.VITE_CATENCE_API_ORIGIN || window.location.origin
).replace(/\/$/, '');

type AddForm = {
  username: string;
  password: string;
  role: AccountRole;
  athletes: AthleteGrant;
};

const EMPTY_ADD_FORM: AddForm = {
  username: '',
  password: '',
  role: 'member',
  athletes: []
};

type GrantPickerProps = {
  options: AthleteOption[];
  value: AthleteGrant;
  loading: boolean;
  error: string | null;
  disabled?: boolean;
  onChange: (grant: AthleteGrant) => void;
};

/**
 * Athlete multiselect shared by the add and edit dialogs. `'all'` is its own
 * grant — it keeps covering athletes added later — while an id list is a
 * snapshot that can be toggled athlete by athlete.
 */
function GrantPicker({
  options,
  value,
  loading,
  error,
  disabled,
  onChange
}: GrantPickerProps) {
  if (loading)
    return <p className="text-sm text-muted-foreground">Loading athletes…</p>;
  if (error)
    return (
      <p className="text-sm text-destructive">
        Could not load the athlete roster: {error}
      </p>
    );
  if (!options.length)
    return (
      <p className="text-sm text-muted-foreground">
        No athletes are configured on this server yet, so there is no athlete
        access to grant.
      </p>
    );

  const isAll = value === 'all';
  const toggle = (id: string, checked: boolean) => {
    if (value === 'all') return;
    onChange(
      checked ? [...value, id] : value.filter((granted) => granted !== id)
    );
  };

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox
          aria-label="All athletes"
          checked={isAll}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onChange(
              checked === true ? 'all' : options.map((option) => option.id)
            )
          }
        />
        All athletes, including ones added later
      </label>
      <div className="grid gap-1.5 border-t pt-2">
        {options.map((option) => (
          <label key={option.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              aria-label={option.label}
              checked={value !== 'all' && value.includes(option.id)}
              disabled={disabled || isAll}
              onCheckedChange={(checked) => toggle(option.id, checked === true)}
            />
            <span>{option.label}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {option.id}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function AccountsContent() {
  const [snapshot, setSnapshot] = useState<AccountsSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [noAccess, setNoAccess] = useState<AccountsFailure | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [roster, setRoster] = useState<AthleteOption[]>([]);
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_ADD_FORM);
  const [addError, setAddError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Account | null>(null);
  const [editGrant, setEditGrant] = useState<AthleteGrant>('all');
  const [editError, setEditError] = useState<string | null>(null);

  const [resetting, setResetting] = useState<Account | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [removing, setRemoving] = useState<Account | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const outcome = await loadAccounts(
        apiOrigin,
        withSignal(controller.signal)
      );
      if (controller.signal.aborted) return;
      setLoaded(true);
      if (outcome.ok) {
        setSnapshot(outcome.data);
        setLoadError(null);
        setNoAccess(null);
        return;
      }
      if (
        outcome.failure.code === 'admin_required' ||
        outcome.failure.code === 'not_authenticated'
      ) {
        setNoAccess(outcome.failure);
        return;
      }
      setLoadError(outcome.failure.message);
    })();
    return () => controller.abort();
  }, [reloadToken]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const outcome = await loadAthleteOptions(
        apiOrigin,
        withSignal(controller.signal)
      );
      if (controller.signal.aborted) return;
      setRosterLoaded(true);
      if (outcome.ok) setRoster(outcome.data);
      else setRosterError(outcome.failure.message);
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const reload = () => setReloadToken((token) => token + 1);

  const openAdd = () => {
    setAddForm(EMPTY_ADD_FORM);
    setAddError(null);
    setNotice(null);
    setAddOpen(true);
  };

  const closeAdd = () => {
    setAddOpen(false);
    setAddError(null);
  };

  const submitAdd = async () => {
    if (busy) return;
    const username = addForm.username.trim();
    setBusy(true);
    setAddError(null);
    setNotice(null);
    const outcome = await addAccount(apiOrigin, addForm);
    setBusy(false);
    if (!outcome.ok) {
      setAddError(outcome.failure.message);
      return;
    }
    setAddOpen(false);
    setNotice(`Added ${username}.`);
    reload();
  };

  const startEdit = (account: Account) => {
    setEditGrant(account.athletes);
    setEditError(null);
    setNotice(null);
    setEditing(account);
  };

  const submitEdit = async () => {
    if (busy || !editing) return;
    setBusy(true);
    setEditError(null);
    setNotice(null);
    const outcome = await updateAccountGrants(apiOrigin, {
      username: editing.username,
      athletes: editGrant
    });
    setBusy(false);
    if (!outcome.ok) {
      setEditError(outcome.failure.message);
      return;
    }
    setNotice(`Updated athlete access for ${editing.username}.`);
    setEditing(null);
    reload();
  };

  const startResetPassword = (account: Account) => {
    setNewPassword('');
    setPasswordError(null);
    setNotice(null);
    setResetting(account);
  };

  const submitResetPassword = async () => {
    if (busy || !resetting) return;
    const username = resetting.username;
    setBusy(true);
    setPasswordError(null);
    setNotice(null);
    const outcome = await resetAccountPassword(
      apiOrigin,
      username,
      newPassword
    );
    setBusy(false);
    if (!outcome.ok) {
      setPasswordError(outcome.failure.message);
      return;
    }
    setNotice(`Password reset for ${username}.`);
    setResetting(null);
    setNewPassword('');
  };

  const startRemove = (account: Account) => {
    setRemoveError(null);
    setNotice(null);
    setRemoving(account);
  };

  const submitRemove = async () => {
    if (busy || !removing) return;
    const username = removing.username;
    setBusy(true);
    setRemoveError(null);
    setNotice(null);
    const outcome = await removeAccount(apiOrigin, username);
    setBusy(false);
    if (!outcome.ok) {
      setRemoveError(outcome.failure.message);
      return;
    }
    setNotice(`Removed ${username}.`);
    setRemoving(null);
    reload();
  };

  if (!loaded) {
    return (
      <main className="flex flex-1 flex-col gap-6 overflow-auto p-6">
        <Skeleton className="h-12 w-56" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  if (noAccess) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold">
            {noAccess.code === 'not_authenticated'
              ? 'Console sign-in required'
              : 'Administrator access required'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {noAccess.message}
          </p>
        </div>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-sm text-destructive">
        {loadError ?? 'Accounts are unavailable.'}
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-6 overflow-auto p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Accounts</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Console logins and the athletes each one can see. Admins always see
            every athlete; members see only the athletes granted here. Passwords
            are never shown.
          </p>
        </div>
        <Button size="sm" disabled={busy} onClick={openAdd}>
          Add account
        </Button>
      </div>

      {loadError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          {notice}
        </div>
      ) : null}
      {rosterLoaded && roster.length === 0 && !rosterError ? (
        <div className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
          No athlete access yet — there are no athletes configured on this
          server. Accounts can still be created; grants become available once
          athletes exist.
        </div>
      ) : null}
      {rosterError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Athlete roster unavailable: {rosterError}
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Console accounts</CardTitle>
          <span className="text-xs text-muted-foreground">
            {snapshot.accounts.length
              ? `${snapshot.accounts.length} account${
                  snapshot.accounts.length === 1 ? '' : 's'
                }`
              : 'No accounts yet'}
          </span>
        </CardHeader>
        <CardContent>
          {snapshot.accounts.length || snapshot.breakGlass ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="pb-2 font-medium">Username</th>
                    <th className="pb-2 font-medium">Role</th>
                    <th className="pb-2 font-medium">Athletes</th>
                    <th className="pb-2 font-medium">Created</th>
                    <th className="pb-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.breakGlass ? (
                    <tr className="border-t bg-muted/30 align-middle">
                      <td className="py-3 pr-4">
                        <div className="font-medium">
                          {snapshot.breakGlass.username}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          break-glass admin
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline">environment</Badge>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">all</td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        —
                      </td>
                      <td className="py-3 text-right text-xs text-muted-foreground">
                        Read-only
                      </td>
                    </tr>
                  ) : null}
                  {snapshot.accounts.map((account) => (
                    <tr
                      key={account.username}
                      className="border-t align-middle"
                    >
                      <td className="py-3 pr-4 font-medium">
                        {account.username}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge
                          variant={
                            account.role === 'admin' ? 'secondary' : 'outline'
                          }
                        >
                          {account.role}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        {formatAthleteGrant(account.athletes)}
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {formatTimestamp(account.createdAt || null)}
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => startEdit(account)}
                          >
                            Edit grants
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => startResetPassword(account)}
                          >
                            Reset password
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={busy}
                            onClick={() => startRemove(account)}
                          >
                            Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No Console accounts have been created yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (!open) closeAdd();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add account</DialogTitle>
            <DialogDescription>
              Create a Console login. Admins always see every athlete; members
              see only the athletes you select.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="account-username">Username</Label>
              <Input
                id="account-username"
                autoComplete="off"
                disabled={busy}
                value={addForm.username}
                onChange={(event) =>
                  setAddForm((form) => ({
                    ...form,
                    username: event.target.value
                  }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="account-password">Password</Label>
              <Input
                id="account-password"
                type="password"
                autoComplete="new-password"
                disabled={busy}
                value={addForm.password}
                onChange={(event) =>
                  setAddForm((form) => ({
                    ...form,
                    password: event.target.value
                  }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="account-role">Role</Label>
              <select
                id="account-role"
                className="w-fit rounded-md border bg-background px-2 py-1 text-sm"
                disabled={busy}
                value={addForm.role}
                onChange={(event) =>
                  setAddForm((form) => ({
                    ...form,
                    role: event.target.value as AccountRole
                  }))
                }
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Athlete access</span>
              {addForm.role === 'admin' ? (
                <p className="text-sm text-muted-foreground">
                  Admins always have all athletes.
                </p>
              ) : (
                <GrantPicker
                  options={roster}
                  value={addForm.athletes}
                  loading={!rosterLoaded}
                  error={rosterError}
                  disabled={busy}
                  onChange={(athletes) =>
                    setAddForm((form) => ({ ...form, athletes }))
                  }
                />
              )}
            </div>
            {addError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {addError}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={closeAdd}>
              Cancel
            </Button>
            <Button
              disabled={busy || !addForm.username.trim() || !addForm.password}
              aria-busy={busy}
              onClick={() => void submitAdd()}
            >
              {busy ? 'Saving…' : 'Create account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editing ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit grants — {editing.username}</DialogTitle>
              <DialogDescription>
                Choose the athletes this member can see.
              </DialogDescription>
            </DialogHeader>
            {editing.role === 'admin' ? (
              <p className="text-sm text-muted-foreground">
                Admins always have all athletes, so there is nothing to edit
                here.
              </p>
            ) : (
              <GrantPicker
                options={roster}
                value={editGrant}
                loading={!rosterLoaded}
                error={rosterError}
                disabled={busy}
                onChange={setEditGrant}
              />
            )}
            {editError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {editError}
              </div>
            ) : null}
            <DialogFooter>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              {editing.role === 'admin' ? null : (
                <Button
                  disabled={busy}
                  aria-busy={busy}
                  onClick={() => void submitEdit()}
                >
                  {busy ? 'Saving…' : 'Save grants'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {resetting ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setResetting(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset password — {resetting.username}</DialogTitle>
              <DialogDescription>
                The new password replaces the current one immediately. Console
                passwords are stored hashed and never shown again.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="account-new-password">New password</Label>
              <Input
                id="account-new-password"
                type="password"
                autoComplete="new-password"
                disabled={busy}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            {passwordError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {passwordError}
              </div>
            ) : null}
            <DialogFooter>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setResetting(null)}
              >
                Cancel
              </Button>
              <Button
                disabled={busy || !newPassword}
                aria-busy={busy}
                onClick={() => void submitResetPassword()}
              >
                {busy ? 'Saving…' : 'Reset password'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {removing ? (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) setRemoving(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {removing.username}?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes the Console login and its athlete grants. It cannot
                be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {removeError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {removeError}
              </div>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={busy}
                aria-busy={busy}
                onClick={() => void submitRemove()}
              >
                {busy ? 'Removing…' : 'Remove account'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      <p className="pb-4 text-xs text-muted-foreground">
        The environment break-glass account is defined outside the Console and
        cannot be edited here. Athlete files and data stay scoped to each
        athlete — an account only ever sees the athletes it is granted.
      </p>
    </main>
  );
}

export default function Accounts() {
  return (
    <Page>
      <AccountsContent />
    </Page>
  );
}
