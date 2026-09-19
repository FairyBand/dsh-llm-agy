import assert from 'node:assert';
import {
  parseAgyQuotaOutput,
  parseAgyQuotaText,
  parseAgyCreditsOutput,
  formatQuotaSummaryMarkdown,
  runAgyQuota,
} from '../lib/quota.js';

console.log('--- 1. Testing parseAgyQuotaOutput ---');
const sampleJsonOutput = JSON.stringify({
  conversation_id: '',
  status: 'SUCCESS',
  response: 'Gemini Models\tWeekly Limit Remaining\t99%\t2026-09-26T04:17:07Z\nGemini Models\tFive Hour Limit Remaining\t96%\t2026-09-19T09:17:07Z\n',
  command: {
    name: 'usage',
    data: {
      groups: [
        {
          name: 'Gemini Models',
          description: 'Models within this group: Gemini Flash, Gemini Pro',
          buckets: [
            {
              id: 'gemini-weekly',
              name: 'Weekly Limit Remaining',
              window: 'weekly',
              remaining_fraction: 0.992,
              reset_time: '2026-09-26T04:17:07Z',
            },
            {
              id: 'gemini-5h',
              name: 'Five Hour Limit Remaining',
              window: '5h',
              remaining_fraction: 0.959,
              reset_time: '2026-09-19T09:17:07Z',
            },
          ],
        },
      ],
    },
  },
});

const groups = parseAgyQuotaOutput(sampleJsonOutput);
assert.strictEqual(groups.length, 1);
assert.strictEqual(groups[0].name, 'Gemini Models');
assert.strictEqual(groups[0].buckets[0].percentage, 99);
assert.strictEqual(groups[0].buckets[1].percentage, 96);
console.log('✓ parseAgyQuotaOutput passed');

console.log('--- 2. Testing fallback text parser ---');
const text = 'Gemini Models\tWeekly Limit Remaining\t85%\t2026-09-26T04:00:00Z';
const textGroups = parseAgyQuotaText(text);
assert.strictEqual(textGroups.length, 1);
assert.strictEqual(textGroups[0].buckets[0].percentage, 85);
console.log('✓ parseAgyQuotaText passed');

console.log('--- 3. Testing parseAgyCreditsOutput ---');
const creditsJson = JSON.stringify({
  status: 'SUCCESS',
  command: {
    name: 'credits',
    data: {
      remaining_credits: 50,
      upgrade_uri: 'https://antigravity.google/g1-upgrade',
    },
  },
});
const credits = parseAgyCreditsOutput(creditsJson);
assert.strictEqual(credits?.remainingCredits, 50);
assert.strictEqual(credits?.upgradeUri, 'https://antigravity.google/g1-upgrade');
console.log('✓ parseAgyCreditsOutput passed');

console.log('--- 4. Testing formatQuotaSummaryMarkdown ---');
const md = formatQuotaSummaryMarkdown({
  ok: true,
  updatedAt: Date.now(),
  groups,
  credits,
});
assert(md.includes('Gemini Models'));
assert(md.includes('99%'));
assert(md.includes('50** 点'));
console.log('✓ formatQuotaSummaryMarkdown passed');

console.log('--- 5. Testing live runAgyQuota query ---');
const live = await runAgyQuota('agy', 'http://127.0.0.1:7897', true);
assert.strictEqual(live.ok, true);
assert(live.groups.length > 0);
console.log('✓ Live query passed! Got', live.groups.length, 'groups');

console.log('\nALL QUOTA VERIFICATION CHECKS PASSED!');
