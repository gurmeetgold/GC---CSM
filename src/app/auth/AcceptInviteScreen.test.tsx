import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AuthProvider } from './AuthContext';
import { AcceptInviteScreen } from './AcceptInviteScreen';

/**
 * UI-level proof that each invite failure state shows the right message (not one
 * generic error) — the phase brief's "handle the edge cases honestly in the UI, not
 * just the API" requirement.
 */
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('AcceptInviteScreen', () => {
  afterEach(() => vi.unstubAllGlobals());

  function renderScreen(validateResponse: { body: unknown; status: number }) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/auth/invite/')) return jsonResponse(validateResponse.body, validateResponse.status);
      return jsonResponse({});
    }));
    render(
      <AuthProvider baseUrl="http://localhost:8787">
        <AcceptInviteScreen token="tok-123" onGoToLogin={() => {}} />
      </AuthProvider>,
    );
  }

  it('shows the org and role for a valid token, with a name/password form', async () => {
    renderScreen({ status: 200, body: { valid: true, orgName: 'Acme CS', role: 'csm', email: 'new@co.com' } });
    await waitFor(() => expect(screen.getByText(/Join Acme CS on SignalOS/)).toBeInTheDocument());
    expect(screen.getByText(/csm/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Accept invite/ })).toBeInTheDocument();
  });

  it('shows an expired-specific message, not a generic error', async () => {
    renderScreen({ status: 410, body: { valid: false, reason: 'expired' } });
    await waitFor(() => expect(screen.getByText('This invite has expired')).toBeInTheDocument());
    expect(screen.getByText(/90 days/)).toBeInTheDocument();
  });

  it('shows an already-used-specific message', async () => {
    renderScreen({ status: 410, body: { valid: false, reason: 'already_used' } });
    await waitFor(() => expect(screen.getByText('This invite has already been used')).toBeInTheDocument());
  });

  it('shows an already-registered message with a path to log in instead', async () => {
    const onGoToLogin = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ valid: false, reason: 'already_registered' }, 410)));
    render(
      <AuthProvider baseUrl="http://localhost:8787">
        <AcceptInviteScreen token="tok-123" onGoToLogin={onGoToLogin} />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('You already have an account')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Go to sign in/ }));
    expect(onGoToLogin).toHaveBeenCalled();
  });

  it('shows a not-found message for a garbage token', async () => {
    renderScreen({ status: 410, body: { valid: false, reason: 'not_found' } });
    await waitFor(() => expect(screen.getByText(/isn’t valid/)).toBeInTheDocument());
  });
});
