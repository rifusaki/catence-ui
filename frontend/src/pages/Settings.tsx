import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { AccountsContent } from 'pages/Accounts';
import { ModelsContent } from 'pages/Models';
import Page from 'pages/Page';
import { ProfileContent } from 'pages/Profile';
import { StatusContent } from 'pages/Status';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { useWhoami } from '@/hooks/useWhoami';

import { AthleteCredentialsDialog } from './AthleteCredentials';
import {
  type AthleteOption,
  createAthlete,
  loadAthleteOptions
} from './accountsApi';

const apiOrigin = (
  import.meta.env.VITE_CATENCE_API_ORIGIN || window.location.origin
).replace(/\/$/, '');

const ATHLETE_ID_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;

/**
 * Admin tab for the server's athlete catalog: the roster plus a form that
 * adds athletes through the runtime (Console proxies the call and checks the
 * admin role).
 */
function AthletesPanel() {
  const [roster, setRoster] = useState<AthleteOption[] | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [setDefault, setSetDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [managing, setManaging] = useState<AthleteOption | null>(null);

  const load = useCallback(async () => {
    const outcome = await loadAthleteOptions(apiOrigin);
    if (outcome.ok) {
      setRoster(outcome.data);
      setRosterError(null);
      return;
    }
    setRosterError(outcome.failure.message);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timeout);
  }, [notice]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const athleteId = id.trim();
    const athleteLabel = label.trim();
    if (!athleteId || !athleteLabel) {
      setError('Athlete id and display name are both required.');
      return;
    }
    if (!ATHLETE_ID_PATTERN.test(athleteId)) {
      setError(
        'Athlete ids use lowercase letters, numbers and dashes, and must start with a letter.'
      );
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await createAthlete(apiOrigin, {
      id: athleteId,
      label: athleteLabel,
      setDefault
    });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.failure.message);
      return;
    }
    setNotice(`Added ${athleteLabel}.`);
    setId('');
    setLabel('');
    setSetDefault(false);
    void load();
  };

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-6">
      <div>
        <h2 className="text-lg font-semibold">Athletes</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Athletes on this server. New athletes appear in the athlete pickers
          right away, and are included in member grants set to all athletes.
        </p>
      </div>

      {rosterError ? (
        <p className="text-sm text-destructive">
          Could not load the athlete roster: {rosterError}
        </p>
      ) : !roster ? (
        <Skeleton className="h-24 w-full" />
      ) : roster.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Current roster</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {roster.map((athlete) => (
              <div key={athlete.id} className="flex items-center gap-2 text-sm">
                <span>{athlete.label}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {athlete.id}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setManaging(athlete)}
                >
                  Credentials
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          No athletes are configured yet — add the first one below.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add athlete</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={submit}>
            <div className="grid gap-1.5">
              <Label htmlFor="athlete-id">Athlete id</Label>
              <Input
                id="athlete-id"
                value={id}
                placeholder="alex"
                autoComplete="off"
                onChange={(event) => setId(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers and dashes — used in URLs and tool
                calls.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="athlete-label">Display name</Label>
              <Input
                id="athlete-label"
                value={label}
                placeholder="Alex"
                autoComplete="off"
                onChange={(event) => setLabel(event.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                aria-label="Set as the default athlete"
                checked={setDefault}
                onCheckedChange={(checked) => setSetDefault(checked === true)}
              />
              Set as the default athlete
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {notice ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                {notice}
              </p>
            ) : null}
            <div>
              <Button type="submit" disabled={busy}>
                {busy ? 'Adding…' : 'Add athlete'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {managing ? (
        <AthleteCredentialsDialog
          athlete={managing}
          onClose={() => setManaging(null)}
        />
      ) : null}
    </div>
  );
}

type SettingsTab = {
  value: string;
  label: string;
  adminOnly: boolean;
  content: () => JSX.Element;
};

function SettingsTabs() {
  const whoami = useWhoami();
  const [searchParams, setSearchParams] = useSearchParams();
  // `whoami === null` means the accounts API is absent (standalone server) or
  // still loading, so nobody is positively known to be a member. Admin tabs
  // are hidden only for accounts confirmed to be members.
  const member = whoami !== null && whoami.role !== 'admin';

  const tabs = useMemo<SettingsTab[]>(
    () =>
      [
        {
          value: 'profile',
          label: 'Profile',
          adminOnly: false,
          content: () => <ProfileContent />
        },
        {
          value: 'status',
          label: 'Status',
          adminOnly: false,
          content: () => <StatusContent />
        },
        {
          value: 'models',
          label: 'Models',
          adminOnly: true,
          content: () => <ModelsContent />
        },
        {
          value: 'athletes',
          label: 'Athletes',
          adminOnly: true,
          content: () => <AthletesPanel />
        },
        {
          value: 'accounts',
          label: 'Accounts',
          adminOnly: true,
          content: () => <AccountsContent />
        }
      ].filter((tab) => !member || !tab.adminOnly),
    [member]
  );

  const requested = searchParams.get('tab');
  const active = tabs.some((tab) => tab.value === requested)
    ? (requested as string)
    : tabs[0].value;

  const selectTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    setSearchParams(next, { replace: true });
  };

  return (
    <Tabs
      value={active}
      onValueChange={selectTab}
      className="flex flex-1 flex-col overflow-hidden"
    >
      <div className="border-b px-6 pt-6 pb-4">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chat preferences, server status, and — for administrators — models,
          athletes and Console accounts.
        </p>
        <TabsList className="mt-4 h-auto flex-wrap justify-start">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((tab) => (
        <TabsContent
          key={tab.value}
          value={tab.value}
          className="mt-0 data-[state=active]:flex flex-1 flex-col overflow-hidden"
        >
          {tab.content()}
        </TabsContent>
      ))}
    </Tabs>
  );
}

export default function Settings() {
  return (
    <Page>
      <SettingsTabs />
    </Page>
  );
}
