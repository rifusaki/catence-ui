import { Fragment, useCallback, useEffect, useState } from 'react';

import Page from 'pages/Page';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

type ModelEntry = {
  id: string;
  label: string;
  model: string;
  reasoningEffort: string | null;
  variants: Record<string, string> | null;
  disabled: boolean;
};

type Profile = {
  id: string;
  label: string;
  defaultModel: string;
  requiredEnvironment: string[];
  missingEnvironment: string[];
  models: ModelEntry[];
};

type ModelsPayload = {
  defaultProfile: string;
  profiles: Profile[];
};

const apiOrigin = (
  import.meta.env.VITE_CATENCE_API_ORIGIN || window.location.origin
).replace(/\/$/, '');

type Draft = {
  modelId: string;
  label: string;
  model: string;
  reasoningEffort: string;
  variants: string;
};

const EMPTY_DRAFT: Draft = {
  modelId: '',
  label: '',
  model: '',
  reasoningEffort: '',
  variants: ''
};

function ModelsContent() {
  const [payload, setPayload] = useState<ModelsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`${apiOrigin}/api/v1/models`);
      if (response.status === 401)
        throw new Error('Console login is required.');
      if (!response.ok)
        throw new Error(`Model list request failed (${response.status}).`);
      setPayload((await response.json()) as ModelsPayload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (action: string, body: Record<string, unknown>) => {
      setBusy(true);
      setNotice(null);
      try {
        const response = await fetch(`${apiOrigin}/api/v1/models/${action}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            result?.error?.message ?? `Request failed (${response.status}).`;
          throw new Error(message);
        }
        setPayload(result as ModelsPayload);
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        return false;
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const discover = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch(`${apiOrigin}/api/v1/models/discover`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      });
      const result = (await response.json().catch(() => null)) as {
        counts?: { chat: number; responses: number; messages: number };
        guessedRoutes?: string[];
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(
          result?.error?.message ?? `Discovery failed (${response.status}).`
        );
      }
      await load();
      const counts = result?.counts;
      setNotice(
        `OpenCode Go discovery merged ${counts?.chat ?? 0} chat, ${
          counts?.responses ?? 0
        } responses, and ${counts?.messages ?? 0} messages models. Custom labels and thinking-effort variants were preserved.`
      );
      if (result?.guessedRoutes?.length)
        setError(
          `Prefix-guessed routes need verification: ${result.guessedRoutes.join(', ')}`
        );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }, [load]);

  if (error && !payload) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-sm text-destructive">
        {error}
      </main>
    );
  }
  if (!payload) {
    return (
      <main className="flex flex-1 flex-col gap-6 overflow-auto p-6">
        <Skeleton className="h-12 w-56" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  const updateDraft = (key: string, patch: Partial<Draft>) =>
    setDrafts((old) => {
      const next: Record<string, Draft> = { ...old };
      next[key] = { ...(old[key] ?? EMPTY_DRAFT), ...patch };
      return next;
    });

  const submitDraft = async (profileId: string) => {
    const draft = drafts[profileId] ?? EMPTY_DRAFT;
    let variants: unknown;
    if (draft.variants.trim()) {
      try {
        variants = JSON.parse(draft.variants);
      } catch {
        setError('Variants must be a JSON object mapping labels to values.');
        return;
      }
    }
    const ok = await post('add', {
      profileId,
      modelId: draft.modelId.trim(),
      label: draft.label.trim(),
      model: draft.model.trim(),
      reasoningEffort: draft.reasoningEffort.trim() || null,
      ...(variants === undefined ? {} : { variants })
    });
    if (ok) {
      setNotice(`Added ${draft.label || draft.modelId} to ${profileId}.`);
      setDrafts((old) => ({ ...old, [profileId]: EMPTY_DRAFT }));
    }
  };

  const startEdit = (profileId: string, model: ModelEntry) => {
    const key = `${profileId}:${model.id}`;
    setEditingKey(key);
    setNotice(null);
    setDrafts((old) => ({
      ...old,
      [key]: {
        modelId: model.id,
        label: model.label,
        model: model.model,
        reasoningEffort: model.reasoningEffort ?? '',
        variants: model.variants === null ? '' : JSON.stringify(model.variants)
      }
    }));
  };

  const submitEdit = async (profileId: string, model: ModelEntry) => {
    const key = `${profileId}:${model.id}`;
    const draft = drafts[key];
    if (!draft) return;
    let variants: unknown;
    if (draft.variants.trim()) {
      try {
        variants = JSON.parse(draft.variants);
      } catch {
        setError('Variants must be a JSON object mapping labels to values.');
        return;
      }
    } else {
      variants = null;
    }
    const ok = await post('update', {
      profileId,
      modelId: model.id,
      label: draft.label.trim() || model.label,
      model: draft.model.trim(),
      reasoningEffort: draft.reasoningEffort.trim() || null,
      variants
    });
    if (ok) {
      setNotice(`Updated ${model.label} in ${profileId}.`);
      setEditingKey(null);
    }
  };

  return (
    <main className="flex flex-1 flex-col gap-6 overflow-auto p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Models</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Enable, disable, edit, and extend the deployments offered in the
            chat settings. Credentials are never stored here — profiles only
            reference environment-variable names.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void discover()}
        >
          Discover OpenCode Go models
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          {notice}
        </div>
      ) : null}

      {payload.profiles.map((profile) => (
        <Card key={profile.id}>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">{profile.label}</CardTitle>
            <div className="flex items-center gap-2">
              {profile.id === payload.defaultProfile ? (
                <Badge variant="secondary">Default profile</Badge>
              ) : null}
              {profile.missingEnvironment.length ? (
                <Badge variant="outline" className="text-amber-600">
                  Missing {profile.missingEnvironment.join(', ')}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-emerald-600">
                  Ready
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="pb-2 font-medium">Enabled</th>
                    <th className="pb-2 font-medium">Model</th>
                    <th className="pb-2 font-medium">Deployment</th>
                    <th className="pb-2 font-medium">Reasoning</th>
                    <th className="pb-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.models.map((model) => (
                    <Fragment key={`${profile.id}:${model.id}`}>
                      <tr className="border-t align-middle">
                        <td className="py-3 pr-4">
                          <Switch
                            checked={!model.disabled}
                            disabled={busy}
                            aria-label={`Toggle ${model.label}`}
                            onClick={() =>
                              post('toggle', {
                                profileId: profile.id,
                                modelId: model.id,
                                disabled: !model.disabled
                              })
                            }
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-medium">
                            {model.label}
                            {!model.disabled &&
                            profile.defaultModel === model.id ? (
                              <span className="ml-2 text-xs text-muted-foreground">
                                default
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {model.id}
                          </div>
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs">
                          {model.model}
                        </td>
                        <td className="py-3 pr-4 text-xs text-muted-foreground">
                          {model.variants === null
                            ? 'Standard levels'
                            : Object.keys(model.variants).length
                              ? Object.entries(model.variants)
                                  .map(([label, value]) => `${label}→${value}`)
                                  .join(', ')
                              : 'Disabled for this model'}
                        </td>
                        <td className="py-3 text-right">
                          <div className="inline-flex justify-end gap-2">
                            {!model.disabled &&
                            profile.defaultModel !== model.id ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() =>
                                  post('default', {
                                    profileId: profile.id,
                                    modelId: model.id
                                  })
                                }
                              >
                                Make default
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => startEdit(profile.id, model)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              disabled={busy}
                              onClick={() =>
                                post('remove', {
                                  profileId: profile.id,
                                  modelId: model.id
                                })
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {editingKey === `${profile.id}:${model.id}` ? (
                        <tr>
                          <td colSpan={5} className="border-t bg-muted/30 p-4">
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="grid gap-1.5">
                                <Label
                                  htmlFor={`${profile.id}-${model.id}-edit-label`}
                                >
                                  Display label
                                </Label>
                                <Input
                                  id={`${profile.id}-${model.id}-edit-label`}
                                  value={
                                    drafts[`${profile.id}:${model.id}`]
                                      ?.label ?? ''
                                  }
                                  onChange={(event) =>
                                    updateDraft(`${profile.id}:${model.id}`, {
                                      label: event.target.value
                                    })
                                  }
                                />
                              </div>
                              <div className="grid gap-1.5">
                                <Label
                                  htmlFor={`${profile.id}-${model.id}-edit-model`}
                                >
                                  LiteLLM deployment reference
                                </Label>
                                <Input
                                  id={`${profile.id}-${model.id}-edit-model`}
                                  value={
                                    drafts[`${profile.id}:${model.id}`]
                                      ?.model ?? ''
                                  }
                                  onChange={(event) =>
                                    updateDraft(`${profile.id}:${model.id}`, {
                                      model: event.target.value
                                    })
                                  }
                                />
                              </div>
                              <div className="grid gap-1.5">
                                <Label
                                  htmlFor={`${profile.id}-${model.id}-edit-effort`}
                                >
                                  Fixed reasoning effort (empty = none)
                                </Label>
                                <Input
                                  id={`${profile.id}-${model.id}-edit-effort`}
                                  placeholder="medium"
                                  value={
                                    drafts[`${profile.id}:${model.id}`]
                                      ?.reasoningEffort ?? ''
                                  }
                                  onChange={(event) =>
                                    updateDraft(`${profile.id}:${model.id}`, {
                                      reasoningEffort: event.target.value
                                    })
                                  }
                                />
                              </div>
                              <div className="grid gap-1.5">
                                <Label
                                  htmlFor={`${profile.id}-${model.id}-edit-variants`}
                                >
                                  Reasoning variants JSON (empty = standard
                                  levels)
                                </Label>
                                <Textarea
                                  id={`${profile.id}-${model.id}-edit-variants`}
                                  placeholder='{"Default": "default", "High": "high"}'
                                  value={
                                    drafts[`${profile.id}:${model.id}`]
                                      ?.variants ?? ''
                                  }
                                  onChange={(event) =>
                                    updateDraft(`${profile.id}:${model.id}`, {
                                      variants: event.target.value
                                    })
                                  }
                                />
                              </div>
                              <div className="flex items-center gap-2 md:col-span-2">
                                <Button
                                  size="sm"
                                  disabled={
                                    busy ||
                                    !drafts[
                                      `${profile.id}:${model.id}`
                                    ]?.model.trim()
                                  }
                                  onClick={() =>
                                    void submitEdit(profile.id, model)
                                  }
                                >
                                  Save changes
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => setEditingKey(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                Add a custom model to {profile.label}
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor={`${profile.id}-model-id`}>Model ID</Label>
                  <Input
                    id={`${profile.id}-model-id`}
                    placeholder="my-deployment"
                    value={(drafts[profile.id] ?? EMPTY_DRAFT).modelId}
                    onChange={(event) =>
                      updateDraft(profile.id, { modelId: event.target.value })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${profile.id}-label`}>Display label</Label>
                  <Input
                    id={`${profile.id}-label`}
                    placeholder="My deployment"
                    value={(drafts[profile.id] ?? EMPTY_DRAFT).label}
                    onChange={(event) =>
                      updateDraft(profile.id, { label: event.target.value })
                    }
                  />
                </div>
                <div className="grid gap-1.5 md:col-span-2">
                  <Label htmlFor={`${profile.id}-model`}>
                    LiteLLM deployment reference
                  </Label>
                  <Input
                    id={`${profile.id}-model`}
                    placeholder="openai/gpt-5-mini or anthropic/claude-sonnet-4-5"
                    value={(drafts[profile.id] ?? EMPTY_DRAFT).model}
                    onChange={(event) =>
                      updateDraft(profile.id, { model: event.target.value })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${profile.id}-effort`}>
                    Fixed reasoning effort (optional)
                  </Label>
                  <Input
                    id={`${profile.id}-effort`}
                    placeholder="medium"
                    value={(drafts[profile.id] ?? EMPTY_DRAFT).reasoningEffort}
                    onChange={(event) =>
                      updateDraft(profile.id, {
                        reasoningEffort: event.target.value
                      })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${profile.id}-variants`}>
                    Reasoning variants JSON (optional)
                  </Label>
                  <Textarea
                    id={`${profile.id}-variants`}
                    placeholder='{"Default": "default", "High": "high"}'
                    value={(drafts[profile.id] ?? EMPTY_DRAFT).variants}
                    onChange={(event) =>
                      updateDraft(profile.id, { variants: event.target.value })
                    }
                  />
                </div>
                <div>
                  <Button
                    size="sm"
                    disabled={
                      busy ||
                      !(drafts[profile.id] ?? EMPTY_DRAFT).modelId.trim() ||
                      !(drafts[profile.id] ?? EMPTY_DRAFT).model.trim()
                    }
                    onClick={() => submitDraft(profile.id)}
                  >
                    Add model
                  </Button>
                </div>
              </div>
            </details>
          </CardContent>
        </Card>
      ))}
      <p className="pb-4 text-xs text-muted-foreground">
        Disabled choices are remembered per machine in the Console database and
        never written into config.json. Editing a model writes config.json
        atomically and keeps every other section untouched. Rediscovering
        OpenCode Go models refreshes their routing references but preserves your
        custom labels and thinking-effort variants.
      </p>
    </main>
  );
}

export default function Models() {
  return (
    <Page>
      <ModelsContent />
    </Page>
  );
}
