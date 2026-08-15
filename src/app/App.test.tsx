import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

/**
 * Smoke tests for the app shell — glue, not logic. Confirm the SignalOS shell
 * renders, the book loads (My Portfolio), and the screens are reachable.
 */
describe('App (smoke)', () => {
  const nav = (name: RegExp) => screen.getAllByRole('button', { name })[0]!;

  it('renders the SignalOS shell and loads the portfolio', async () => {
    render(<App />);
    expect(screen.getByText('SignalOS')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('My Portfolio')).toBeInTheDocument());
    expect(screen.getByText('ARR Managed')).toBeInTheDocument();
  });

  it('navigates to the Executive view', async () => {
    render(<App />);
    await waitFor(() => screen.getByText('My Portfolio'));
    fireEvent.click(nav(/Executive View/));
    await waitFor(() => expect(screen.getByText('Net Revenue Retention')).toBeInTheDocument());
  });

  it('navigates to the Renewals center', async () => {
    render(<App />);
    await waitFor(() => screen.getByText('My Portfolio'));
    fireEvent.click(nav(/^Renewals$/));
    await waitFor(() => expect(screen.getByText('Renewals & Risk Center')).toBeInTheDocument());
  });

  it('navigates to the Support view', async () => {
    render(<App />);
    await waitFor(() => screen.getByText('My Portfolio'));
    fireEvent.click(nav(/Technical Health/));
    await waitFor(() => expect(screen.getByText('Support & Technical Attention')).toBeInTheDocument());
  });

  it('asks a question from the top-bar search', async () => {
    render(<App />);
    await waitFor(() => screen.getByText('My Portfolio'));
    const input = screen.getByLabelText(/Search or ask/i);
    fireEvent.change(input, { target: { value: 'which accounts are at risk?' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(screen.getByText(/Interpreted as:/)).toBeInTheDocument());
  });

  it('disables the unbuilt nav items (Playbooks, Alerts)', async () => {
    render(<App />);
    await waitFor(() => screen.getByText('My Portfolio'));
    expect(nav(/Playbooks/)).toBeDisabled();
    expect(nav(/Alerts/)).toBeDisabled();
  });

  it('hides the Admin Console nav item in the zero-backend local demo (no auth, no admin)', async () => {
    render(<App />);
    await waitFor(() => screen.getByText('My Portfolio'));
    expect(screen.queryByRole('button', { name: /Admin Console/ })).not.toBeInTheDocument();
  });
});
