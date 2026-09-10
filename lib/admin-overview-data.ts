import {
  parseFeedbackRecords,
  type FeedbackRecord,
} from '@/contracts/feedback';
import { readFeedbackFixtures } from '@/lib/feedback-datasets';

export type AdminOverviewRecord = {
  feedback: FeedbackRecord;
  replayUrl: string | null;
  shortId: string;
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
  return records.map((feedback) => ({
    feedback,
    replayUrl: bundledReplayIds.has(feedback.id)
      ? `/media/journeys/${feedback.id}.webm`
      : null,
    shortId: feedback.id.replace(/^shopper-feedback-/, '#'),
  }));
}
