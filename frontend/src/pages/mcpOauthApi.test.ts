import { describe, expect, it } from 'vitest';

import {
  type FetchImpl,
  type McpOauthSettings,
  buildMcpOauthSettingsPayload,
  classifyMcpOauthSettingsFailure,
  getMcpOauthSettings,
  mcpOauthSettingsFailure,
  mcpOauthSettingsUrl,
  parseMcpOauthSettings,
  updateMcpOauthSettings
} from './mcpOauthApi';

const ORIGIN = 'https://catence.test';

const settingsBody: McpOauthSettings = {
  enabled: true,
  publicUrl: 'https://catence-mcp.example.com',
  source: 'console',
  settingsFile: '/data/oauth/settings.json',
  settingsState: 'ok'
};

describe('mcpOauthSettingsUrl', () => {
  it('targets the OAuth settings endpoint', () => {
    expect(mcpOauthSettingsUrl(ORIGIN)).toBe(
      `${ORIGIN}/api/v1/mcp-oauth-settings`
    );
  });
});

describe('buildMcpOauthSettingsPayload', () => {
  it('keeps a trimmed public URL', () => {
    expect(
      buildMcpOauthSettingsPayload({
        enabled: true,
        publicUrl: '  https://catence-mcp.example.com/  '
      })
    ).toEqual({
      enabled: true,
      publicUrl: 'https://catence-mcp.example.com/'
    });
  });

  it('omits a blank public URL instead of sending an empty string', () => {
    expect(buildMcpOauthSettingsPayload({ enabled: false })).toEqual({
      enabled: false
    });
    expect(
      buildMcpOauthSettingsPayload({ enabled: false, publicUrl: '   ' })
    ).toEqual({ enabled: false });
  });
});

describe('parseMcpOauthSettings', () => {
  it('accepts the runtime shape', () => {
    expect(parseMcpOauthSettings(settingsBody)).toEqual(settingsBody);
  });

  it('accepts a null public URL when disabled', () => {
    const disabled = { ...settingsBody, enabled: false, publicUrl: null };
    expect(parseMcpOauthSettings(disabled)).toEqual(disabled);
  });

  it('rejects malformed shapes', () => {
    expect(parseMcpOauthSettings(null)).toBeNull();
    expect(parseMcpOauthSettings('settings')).toBeNull();
    expect(
      parseMcpOauthSettings({ ...settingsBody, enabled: 'yes' })
    ).toBeNull();
    expect(parseMcpOauthSettings({ ...settingsBody, publicUrl: 5 })).toBeNull();
    expect(
      parseMcpOauthSettings({ ...settingsBody, source: 'elsewhere' })
    ).toBeNull();
    expect(
      parseMcpOauthSettings({ ...settingsBody, settingsFile: '' })
    ).toBeNull();
    expect(
      parseMcpOauthSettings({ ...settingsBody, settingsState: 'weird' })
    ).toBeNull();
    const { settingsFile: _omitted, ...withoutFile } = settingsBody;
    expect(parseMcpOauthSettings(withoutFile)).toBeNull();
  });
});

describe('classifyMcpOauthSettingsFailure', () => {
  it('prefers the server error code', () => {
    expect(
      classifyMcpOauthSettingsFailure(400, {
        code: 'mcp_oauth_settings_update_failed',
        message: 'publicUrl must use https:'
      })
    ).toEqual({
      code: 'mcp_oauth_settings_update_failed',
      message: 'publicUrl must use https:'
    });
  });

  it('maps statuses without a known code', () => {
    expect(classifyMcpOauthSettingsFailure(401, null)).toMatchObject({
      code: 'not_authenticated'
    });
    expect(classifyMcpOauthSettingsFailure(403, null)).toMatchObject({
      code: 'admin_required'
    });
    expect(classifyMcpOauthSettingsFailure(400, null)).toMatchObject({
      code: 'invalid_request'
    });
    expect(classifyMcpOauthSettingsFailure(500, null)).toMatchObject({
      code: 'server_error'
    });
    expect(
      classifyMcpOauthSettingsFailure(503, { code: 'mystery' })
    ).toMatchObject({ code: 'server_error' });
  });
});

describe('mcpOauthSettingsFailure', () => {
  it('falls back to the default copy and trims custom messages', () => {
    expect(mcpOauthSettingsFailure('network')).toEqual({
      code: 'network',
      message: 'The server could not be reached.'
    });
    expect(mcpOauthSettingsFailure('network', '  dial failed  ')).toEqual({
      code: 'network',
      message: 'dial failed'
    });
    expect(mcpOauthSettingsFailure('network', '   ')).toEqual({
      code: 'network',
      message: 'The server could not be reached.'
    });
  });
});

describe('getMcpOauthSettings', () => {
  it('returns the parsed settings on success', async () => {
    const fetchImpl: FetchImpl = async () =>
      new Response(JSON.stringify(settingsBody), { status: 200 });
    expect(await getMcpOauthSettings(ORIGIN, fetchImpl)).toEqual({
      ok: true,
      data: settingsBody
    });
  });

  it('classifies admin rejections', async () => {
    const fetchImpl: FetchImpl = async () =>
      new Response(
        JSON.stringify({
          error: { code: 'admin_required', message: 'admins only' }
        }),
        { status: 403 }
      );
    expect(await getMcpOauthSettings(ORIGIN, fetchImpl)).toEqual({
      ok: false,
      failure: { code: 'admin_required', message: 'admins only' }
    });
  });

  it('surfaces mcp_oauth_not_configured', async () => {
    const fetchImpl: FetchImpl = async () =>
      new Response(
        JSON.stringify({ error: { code: 'mcp_oauth_not_configured' } }),
        { status: 400 }
      );
    const outcome = await getMcpOauthSettings(ORIGIN, fetchImpl);
    expect(outcome).toMatchObject({
      ok: false,
      failure: { code: 'mcp_oauth_not_configured' }
    });
    if (!outcome.ok) {
      expect(outcome.failure.message).toContain('--oauth-settings-file');
    }
  });

  it('reports invalid response shapes', async () => {
    const fetchImpl: FetchImpl = async () =>
      new Response(JSON.stringify({ nope: true }), { status: 200 });
    expect(await getMcpOauthSettings(ORIGIN, fetchImpl)).toMatchObject({
      ok: false,
      failure: { code: 'invalid_response' }
    });
  });

  it('reports network failures without throwing', async () => {
    const fetchImpl: FetchImpl = async () => {
      throw new Error('connection refused');
    };
    expect(await getMcpOauthSettings(ORIGIN, fetchImpl)).toMatchObject({
      ok: false,
      failure: { code: 'network' }
    });
  });
});

describe('updateMcpOauthSettings', () => {
  it('posts the payload and returns the saved settings', async () => {
    let captured: { url: string; init?: RequestInit } | null = null;
    const fetchImpl: FetchImpl = async (input, init) => {
      captured = { url: String(input), init };
      return new Response(JSON.stringify(settingsBody), { status: 200 });
    };
    const outcome = await updateMcpOauthSettings(
      ORIGIN,
      { enabled: true, publicUrl: ' https://catence-mcp.example.com ' },
      fetchImpl
    );
    expect(outcome).toEqual({ ok: true, data: settingsBody });
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe(`${ORIGIN}/api/v1/mcp-oauth-settings`);
    expect(captured!.init?.method).toBe('POST');
    expect(JSON.parse(String(captured!.init?.body))).toEqual({
      enabled: true,
      publicUrl: 'https://catence-mcp.example.com'
    });
  });

  it('surfaces runtime validation failures with the server message', async () => {
    const fetchImpl: FetchImpl = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'mcp_oauth_settings_update_failed',
            message:
              'publicUrl must use https: the OAuth issuer is advertised publicly.'
          }
        }),
        { status: 400 }
      );
    const outcome = await updateMcpOauthSettings(
      ORIGIN,
      { enabled: true, publicUrl: 'http://catence-mcp.example.com' },
      fetchImpl
    );
    expect(outcome).toEqual({
      ok: false,
      failure: {
        code: 'mcp_oauth_settings_update_failed',
        message:
          'publicUrl must use https: the OAuth issuer is advertised publicly.'
      }
    });
  });

  it('reports invalid response shapes', async () => {
    const fetchImpl: FetchImpl = async () =>
      new Response(JSON.stringify({ enabled: 'yes' }), { status: 200 });
    expect(
      await updateMcpOauthSettings(ORIGIN, { enabled: false }, fetchImpl)
    ).toMatchObject({
      ok: false,
      failure: { code: 'invalid_response' }
    });
  });
});
