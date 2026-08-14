import type { EvaluatedAccount } from '../../answer';
import { Leadership } from './Leadership';

/** The Executive / Leadership view. Hosts the leadership roll-ups (NRR/GRR, portfolio,
 *  coverage, renewals, reports) in the app shell. */
export function Executive({ book, now }: { book: EvaluatedAccount[]; now: Date }) {
  return <Leadership book={book} now={now} />;
}
