import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import App from './App';

/**
 * Smoke tests only — the app glue, not the logic. We confirm the shell renders,
 * the book loads through the DataSource seam, and the three screens are reachable.
 */
describe('App (smoke)', () => {
  it('renders the header and loads the book', async () => {
    render(<App />);
    expect(screen.getByText('Customer Success Copilot')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/at risk ·/)).toBeInTheDocument();
    });
  });

  it('navigates to the at-risk screen', async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/at risk ·/));
    fireEvent.click(screen.getByRole('button', { name: /At-risk accounts/ }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /at-risk accounts/i })).toBeInTheDocument();
    });
  });

  it('navigates to the leadership screen and shows the hero metrics', async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/at risk ·/));
    fireEvent.click(screen.getByRole('button', { name: /Leadership/ }));
    await waitFor(() => {
      expect(screen.getByText('Net Revenue Retention')).toBeInTheDocument();
      expect(screen.getByText('ARR at risk')).toBeInTheDocument();
    });
  });

  it('navigates to the ask-anything screen and answers a question', async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/at risk ·/));
    fireEvent.click(screen.getByRole('button', { name: /Ask anything/ }));
    const input = await screen.findByLabelText(/Ask a question/i);
    fireEvent.change(input, { target: { value: 'which accounts are at risk?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => {
      expect(screen.getByText(/Interpreted as:/)).toBeInTheDocument();
    });
  });
});
