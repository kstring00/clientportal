/**
 * Money splitting for the deposit / final schedule.
 *
 * Kept apart from the Stripe client so it can be tested without touching an
 * environment variable, and so the one rule that matters is easy to find: the
 * two halves must always sum to EXACTLY the agreed total. Rounding each half
 * independently loses or invents a cent on odd amounts, and a client who is
 * billed $1,250.01 against a $2,500.01 agreement notices.
 */

export function toCents(amount: number) {
  return Math.round(amount * 100);
}

export function fromCents(cents: number) {
  return cents / 100;
}

/**
 * Splits an agreed total into two halves. Odd cents land on the DEPOSIT, so the
 * two invoices always sum to the agreed total and the client is never asked for
 * more at the end than they were quoted.
 */
export function splitTotal(total: number) {
  const cents = toCents(total);
  const final = Math.floor(cents / 2);
  const deposit = cents - final;
  return { depositCents: deposit, finalCents: final };
}

/** Formats cents for display. The portal shows money in one place, one way. */
export function formatMoney(amount: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}
