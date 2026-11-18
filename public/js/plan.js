// plan.js: one place for LearnPath's pricing plan.
//
// Today LearnPath is FREE FOR A LIMITED TIME. A paywall may be added later.
// `paywallEnabled` is a switch kept ready for that: it is false, and no payment code exists yet.
// When a paywall is built, check PLAN.paywallEnabled before AI requests (see ai-client.js)
// and show the upgrade screen instead of calling the AI.

export const PLAN = {
  freeForLimitedTime: true,
  paywallEnabled: false,
  dailyAiLimit: 50, // AI requests per browser per day (the student can reset it in Settings)
  notice: 'Free for a limited time',
  noticeLong: 'LearnPath is free for a limited time. Paid plans may be added later.',
};
