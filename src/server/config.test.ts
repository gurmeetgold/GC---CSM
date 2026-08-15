import { describe, it, expect } from 'vitest';
import { resolveServerConfig, assertLiveConfig } from './config';

describe('resolveServerConfig (independent switches)', () => {
  it('defaults both switches to mock with an empty env', () => {
    const cfg = resolveServerConfig({});
    expect(cfg.dataSource).toBe('mock');
    expect(cfg.answerEngine).toBe('mock');
  });

  it('allows live data with mock answers (independent)', () => {
    const cfg = resolveServerConfig({ DATA_SOURCE: 'live', ANSWER_ENGINE: 'mock' });
    expect(cfg.dataSource).toBe('live');
    expect(cfg.answerEngine).toBe('mock');
  });

  it('allows mock data with claude answers (independent)', () => {
    const cfg = resolveServerConfig({ DATA_SOURCE: 'mock', ANSWER_ENGINE: 'claude' });
    expect(cfg.dataSource).toBe('mock');
    expect(cfg.answerEngine).toBe('claude');
  });

  it('reads Merge/Gong/Claude config from env when present', () => {
    const cfg = resolveServerConfig({
      DATA_SOURCE: 'live',
      MERGE_ACCESS_KEY: 'mk', MERGE_ACCOUNT_TOKEN: 'mt',
      GONG_BASE_URL: 'https://gong', GONG_AUTHORIZATION: 'Basic z',
      ANTHROPIC_API_KEY: 'sk-ant', ANSWER_ENGINE: 'claude',
    });
    expect(cfg.merge?.accessKey).toBe('mk');
    expect(cfg.gong?.baseUrl).toBe('https://gong');
    expect(cfg.claude?.apiKey).toBe('sk-ant');
  });

  it('assertLiveConfig throws when live data lacks Merge secrets', () => {
    expect(() => assertLiveConfig(resolveServerConfig({ DATA_SOURCE: 'live' }))).toThrow(/MERGE/);
  });

  it('assertLiveConfig throws when claude answers lack the API key', () => {
    expect(() => assertLiveConfig(resolveServerConfig({ ANSWER_ENGINE: 'claude' }))).toThrow(/ANTHROPIC/);
  });

  it('assertLiveConfig passes for all-mock', () => {
    expect(() => assertLiveConfig(resolveServerConfig({}))).not.toThrow();
  });

  it('defaults appBaseUrl and leaves email unset when no EMAIL_API_KEY is present', () => {
    const cfg = resolveServerConfig({});
    expect(cfg.appBaseUrl).toBe('http://localhost:5173');
    expect(cfg.email).toBeUndefined();
  });

  it('reads email config from env, with a sandbox-sender default for EMAIL_FROM', () => {
    const cfg = resolveServerConfig({ EMAIL_API_KEY: 're_123', APP_BASE_URL: 'https://app.example.com' });
    expect(cfg.email).toEqual({ apiKey: 're_123', from: 'SignalOS <onboarding@resend.dev>' });
    expect(cfg.appBaseUrl).toBe('https://app.example.com');
  });

  it('honors an explicit EMAIL_FROM override', () => {
    const cfg = resolveServerConfig({ EMAIL_API_KEY: 're_123', EMAIL_FROM: 'Acme <invites@acme.com>' });
    expect(cfg.email?.from).toBe('Acme <invites@acme.com>');
  });
});
