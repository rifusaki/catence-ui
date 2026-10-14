import { describe, expect, it } from 'vitest';

import {
  type FetchImpl,
  classifyMcpExposureFailure,
  loadMcpExposure,
  mcpExposureFailure,
  mcpExposureUrl,
  parseMcpExposure,
  setMcpExposure,
  tunnelIngressSnippet
} from './mcpExposureApi';

describe('mcpExposureUrl', () => {
  it('targets the exposure endpoint', () => {
    expect(mcpExposureUrl('https://catence.test')).toBe(
      'https://catence.test/api/v1/mcp-exposure'
    );
  });
});

describe('parseMcpExposure', () => {
  it('parses a disabled status without a token', () => {
    expect(
      parseMcpExposure({
        enabled: false,
        tokenFile: '/data/mcp-token',
        endpoint: 'http://127.0.0.1:8787/mcp',
        healthEndpoint: 'http://127.0.0.1:8787/health'
      })
    ).toEqual({
      enabled: false,
      tokenFile: '/data/mcp-token',
      endpoint: 'http://127.0.0.1:8787/mcp',
      healthEndpoint: 'http://127.0.0.1:8787/health',
      token: null
    });
  });

  it('parses an enabled status with its token', () => {
    expect(
      parseMcpExposure({
        enabled: true,
        tokenFile: '/data/mcp-token',
        endpoint: 'http://127.0.0.1:8787/mcp',
        healthEndpoint: 'http://127.0.0.1:8787/health',
        token: 'abc123'
      })
    ).toEqual({
      enabled: true,
      tokenFile: '/data/mcp-token',
      endpoint: 'http://127.0.0.1:8787/mcp',
      healthEndpoint: 'http://127.0.0.1:8787/health',
      token: 'abc123'
    });
  });

  it('rejects non-object, missing, and mistyped shapes', () => {
    expect(parseMcpExposure(null)).toBeNull();
    expect(parseMcpExposure('enabled')).toBeNull();
    expect(parseMcpExposure({ enabled: 'yes' })).toBeNull();
    expect(parseMcpExposure({ enabled: true, tokenFile: 1 })).toBeNull();
    expect(
      parseMcpExposure({ enabled: true, tokenFile: '/t', token: 42 })
    ).toBeNull();
  });
});

describe('classifyMcpExposureFailure', () => {
  it('prefers the server error code and message', () => {
    expect(
      classifyMcpExposureFailure(400, {
        code: 'exposure_not_configured',
        message: 'restart with --auth-token-file'
      })
    ).toEqual({
      code: 'exposure_not_configured',
      message: 'restart with --auth-token-file'
    });
  });

  it('maps plain statuses onto stable codes', () => {
    expect(classifyMcpExposureFailure(401, null)).toMatchObject({
      code: 'not_authenticated'
    });
    expect(classifyMcpExposureFailure(403, null)).toMatchObject({
      code: 'admin_required'
    });
    expect(classifyMcpExposureFailure(500, null)).toMatchObject({
      code: 'server_error'
    });
  });

  it('falls back to curated copy when the server message is blank', () => {
    const failure = mcpExposureFailure('admin_required', '   ');
    expect(failure.message).toContain('admin');
  });
});

describe('loadMcpExposure', () => {
  it('returns the parsed status on success', async () => {
    const fetchImpl: FetchImpl = async () =>
      new Response(
        JSON.stringify({
          enabled: true,
          tokenFile: '/data/mcp-token',
          endpoint: 'http://127.0.0.1:8787/mcp',
          healthEndpoint: 'http://127.0.0.1:8787/health',
          token: 'tok'
        }),
        { status: 200 }
      );
    expect(await loadMcpExposure('https://catence.test', fetchImpl)).toEqual({
      ok: true,
      data: {
        enabled: true,
        tokenFile: '/data/mcp-token',
        endpoint: 'http://127.0.0.1:8787/mcp',
        healthEndpoint: 'http://127.0.0.1:8787/health',
        token: 'tok'
      }
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
    expect(await loadMcpExposure('https://catence.test', fetchImpl)).toEqual({
      ok: false,
      failure: { code: 'admin_required', message: 'admins only' }
    });
  });

  it('reports network failures without throwing', async () => {
    const failing: FetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(
      await loadMcpExposure('https://catence.test', failing)
    ).toMatchObject({ ok: false, failure: { code: 'network' } });
  });
});

describe('setMcpExposure', () => {
  it('posts the enable flag and returns the new status', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl: FetchImpl = async (_input, init) => {
      capturedInit = init;
      return new Response(
        JSON.stringify({
          enabled: false,
          tokenFile: '/data/mcp-token',
          endpoint: 'http://127.0.0.1:8787/mcp',
          healthEndpoint: 'http://127.0.0.1:8787/health'
        }),
        { status: 200 }
      );
    };
    const outcome = await setMcpExposure(
      'https://catence.test',
      false,
      fetchImpl
    );
    expect(capturedInit?.method).toBe('POST');
    expect(capturedInit?.body).toBe(JSON.stringify({ enabled: false }));
    expect(outcome).toMatchObject({ ok: true, data: { enabled: false } });
  });
});

describe('tunnelIngressSnippet', () => {
  it('renders the ingress for a given hostname', () => {
    expect(tunnelIngressSnippet('mcp.example.com')).toBe(
      [
        'ingress:',
        '  - hostname: mcp.example.com',
        '    service: http://127.0.0.1:8787',
        '  - service: http_status:404'
      ].join('\n')
    );
  });

  it('trims and refuses empty hostnames', () => {
    expect(tunnelIngressSnippet('  mcp.example.com  ')).toBe(
      tunnelIngressSnippet('mcp.example.com')
    );
    expect(tunnelIngressSnippet('   ')).toBe('');
  });
});
