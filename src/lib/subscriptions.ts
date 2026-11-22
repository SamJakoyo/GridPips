import type { BillingCycle, SubscriptionStatus } from '../types';

export interface SubscriptionPlanSpec {
  cycle: BillingCycle;
  label: string;
  shortLabel: string;
  periodSuffix: string;
  durationDays: number;
  months: number;
  discountPct: number;
  savingsBadge?: string;
}

export const SUBSCRIPTION_PLAN_SPECS: SubscriptionPlanSpec[] = [
  {
    cycle: 'monthly',
    label: 'Monthly',
    shortLabel: 'Monthly · 30d',
    periodSuffix: '/mo',
    durationDays: 30,
    months: 1,
    discountPct: 0,
  },
  {
    cycle: 'quarterly',
    label: 'Quarterly',
    shortLabel: 'Quarterly · 90d',
    periodSuffix: '/3 mo',
    durationDays: 90,
    months: 3,
    discountPct: 10,
    savingsBadge: 'Save 10%',
  },
  {
    cycle: 'annual',
    label: 'Annual',
    shortLabel: 'Annual · 365d',
    periodSuffix: '/yr',
    durationDays: 365,
    months: 12,
    discountPct: 20,
    savingsBadge: 'Save 20%',
  },
];

export function getPlanSpec(cycle?: string | null): SubscriptionPlanSpec {
  if (cycle === 'quarterly') return SUBSCRIPTION_PLAN_SPECS[1];
  if (cycle === 'annual') return SUBSCRIPTION_PLAN_SPECS[2];
  return SUBSCRIPTION_PLAN_SPECS[0];
}

export function computeCyclePricing(
  monthlyUsd: number,
  usdKesRate: number,
  cycle: BillingCycle
): {
  spec: SubscriptionPlanSpec;
  amountUsd: number;
  amountKes: number;
  effectiveMonthlyUsd: number;
} {
  const spec = getPlanSpec(cycle);
  const multiplier = 1 - spec.discountPct / 100;
  const amountUsd = Number((monthlyUsd * spec.months * multiplier).toFixed(2));
  const amountKes = Math.max(1, Math.round(amountUsd * usdKesRate));
  const effectiveMonthlyUsd = Number((amountUsd / spec.months).toFixed(2));
  return { spec, amountUsd, amountKes, effectiveMonthlyUsd };
}

export function formatShortDate(iso?: string | null): string {
  if (!iso) return '—';
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return iso.slice(0, 10);
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function describeSubscriptionStatus(
  hasAccess: boolean,
  status?: SubscriptionStatus,
  expiresAt?: string | null,
  daysRemaining?: number | null
): {
  tone: 'emerald' | 'amber' | 'rose' | 'slate';
  label: string;
  detail: string;
} {
  if (hasAccess) {
    if (!expiresAt) {
      return {
        tone: 'emerald',
        label: 'Active Subscription',
        detail: 'Full unrestricted access',
      };
    }
    if (status === 'expiring_soon' || (typeof daysRemaining === 'number' && daysRemaining <= 5)) {
      return {
        tone: 'amber',
        label: `Expiring in ${daysRemaining ?? 0}d`,
        detail: `Renews ${formatShortDate(expiresAt)}`,
      };
    }
    return {
      tone: 'emerald',
      label: `Active · ${daysRemaining ?? 0}d left`,
      detail: `Valid through ${formatShortDate(expiresAt)}`,
    };
  }

  if (status === 'expired' || expiresAt) {
    return {
      tone: 'rose',
      label: 'Subscription Expired',
      detail: expiresAt ? `Ended ${formatShortDate(expiresAt)}` : 'Renewal required',
    };
  }

  return {
    tone: 'amber',
    label: 'Not Subscribed',
    detail: 'Flexible monthly, quarterly, or annual plans',
  };
}
