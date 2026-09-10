import shopper from '../data/shopper-feedback.json';
import compatibility from '../data/feedback/synthetic-submissions.json';
import { parseFeedbackRecords } from '../contracts/feedback.ts';

/** Seed sources only. Importing this module never alters browser storage. */
export function readFeedbackFixtures() {
  return {
    shopper: parseFeedbackRecords(structuredClone(shopper)),
    compatibility: parseFeedbackRecords(structuredClone(compatibility)),
  };
}
