import {
  parseFeedbackRecords,
  type FeedbackRecord,
} from '@/contracts/feedback';
import { readFeedbackFixtures } from '@/lib/feedback-datasets';
import collective from '@/data/collective-cache.json';
import shopperNames from '@/data/shopper-names.json';
import type { RewardLedger } from '@/agents/reward-agent/index.ts';

export type AdminOverviewRecord = {
  feedback: FeedbackRecord;
  replayUrl: string | null;
  shortId: string;
  strategyMatch?: string;
  analysis?: {
    title: string;
    problem: string;
    source: 'cached';
    generatedAt: string;
  };
};

// Recorded fixture replays present in public/media/journeys, not live agent runs.
const bundledReplayIds = new Set([
  'shopper-feedback-001',
  'shopper-feedback-002',
  'shopper-feedback-003',
  'shopper-feedback-004',
  'shopper-feedback-005',
  'shopper-feedback-006',
  'shopper-feedback-007',
  'shopper-feedback-008',
  'shopper-feedback-009',
  'shopper-feedback-010',
  'shopper-feedback-011',
  'shopper-feedback-012',
  'shopper-feedback-013',
  'shopper-feedback-014',
  'shopper-feedback-015',
  'shopper-feedback-016',
  'shopper-feedback-017',
  'shopper-feedback-018',
  'shopper-feedback-019',
  'shopper-feedback-020',
  'SYN-FB-02',
  'SYN-FB-03',
  'SYN-FB-04',
  'SYN-FB-05',
  'SYN-FB-06',
  'SYN-FB-07',
  'SYN-FB-08',
  'SYN-FB-09',
  'SYN-FB-10',
  'SYN-FB-11',
  'SYN-FB-12',
  'SYN-FB-13',
  'SYN-FB-14',
]);

export function getAdminOverviewRecords(): AdminOverviewRecord[] {
  const { shopper, compatibility } = readFeedbackFixtures();
  const records = parseFeedbackRecords([
    ...shopper,
    // The rehearsal twin is not a separate shopper submission.
    ...compatibility.filter((record) => record.id !== 'SYN-FB-01'),
  ]);
  return records.map((feedback, index) => ({
    feedback,
    replayUrl: bundledReplayIds.has(feedback.id)
      ? `/media/journeys/${feedback.id}.webm`
      : null,
    shortId: `SIG-${String(index + 1).padStart(4, '0')}`,
  }));
}

// Merchant-selected AOV focus. Membership comes from the saved prioritization,
// not from rewriting the shopper evidence or claiming a new agent diagnosis.
const aovFocus: Record<string, string> = {
  'model-compatibility': 'Compatible parts',
  'complete-installation': 'Complete setups',
  'maintenance-companions': 'Accessory attachment',
};

export function getStrategyOverview() {
  const allRecords = getAdminOverviewRecords();
  const matches = new Map<string, string>();
  for (const opportunity of collective.prioritization.opportunities) {
    const focus = aovFocus[opportunity.id];
    if (focus) for (const id of opportunity.feedbackIds) matches.set(id, focus);
  }
  return {
    totalSignals: allRecords.length,
    records: allRecords.map((record) => ({
      ...record,
      strategyMatch: matches.get(record.feedback.id),
      analysis: (() => {
        const finding = collective.prioritization.opportunities.find(
          (item) =>
            item.feedbackIds.includes(record.feedback.id) && aovFocus[item.id],
        );
        return finding
          ? {
              title: finding.title,
              problem: finding.problem,
              source: 'cached' as const,
              generatedAt: collective.generatedAt,
            }
          : undefined;
      })(),
    })),
  };
}

export type RewardPayout = RewardLedger['contributions'][number] & {
  shortId: string;
  shopper: string;
};

/** Demo personas, not real customers. Stable per record so a shopper keeps one name across the session. */
function nameByRecord(records: AdminOverviewRecord[]) {
  const names = shopperNames as string[];
  const assigned = new Map<string, string>();
  const taken = new Set<string>();
  for (const { feedback } of records) {
    let hash = 0;
    for (const char of feedback.id)
      hash = (hash * 31 + char.charCodeAt(0)) % 100003;
    let index = hash % names.length;
    while (taken.has(names[index]) && taken.size < names.length)
      index = (index + 1) % names.length;
    taken.add(names[index]);
    assigned.set(feedback.id, names[index]);
  }
  return assigned;
}

/** The ledger the reward agent produced for the published improvement, as the merchant would pay it. */
export function getRewardLedger() {
  const ledger = collective.reward as unknown as RewardLedger;
  const records = getAdminOverviewRecords();
  const names = nameByRecord(records);
  // The signal id the rest of the admin shows, so a payout traces back to the row it came from.
  const shortIds = new Map(
    records.map((record) => [record.feedback.id, record.shortId]),
  );
  return {
    ...ledger,
    contributions: ledger.contributions.map((item) => ({
      ...item,
      shortId: shortIds.get(item.feedbackId) ?? item.feedbackId,
      shopper: names.get(item.feedbackId) ?? item.feedbackId,
    })),
  };
}
