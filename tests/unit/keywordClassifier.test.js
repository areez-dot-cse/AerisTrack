import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyByKeywords, KEYWORD_CONFIDENCE } from '../../src/services/keywordClassifier.js';

test('Tamil and English keywords map to a category with a fixed low confidence', () => {
  assert.deepEqual(classifyByKeywords('இன்று கரண்ட் இல்லை'), { category: 'POWER_CUT', confidence: KEYWORD_CONFIDENCE, hits: 1 });
  assert.equal(classifyByKeywords('Mechanic is coming for the repair').category, 'MACHINE_BREAKDOWN');
  assert.equal(classifyByKeywords('துணி இன்னும் வரலை').category, 'FABRIC_DELAY');
  assert.equal(classifyByKeywords('பிரிண்டிங் யூனிட் பீஸ் அனுப்பலை').category, 'SUBCONTRACTOR_DELAY');
  assert.equal(KEYWORD_CONFIDENCE, 0.4);
});

test('the category with the most hits wins; no hits means OTHER', () => {
  assert.equal(classifyByKeywords('machine repair and one person on leave').category, 'MACHINE_BREAKDOWN');
  assert.deepEqual(classifyByKeywords(''), { category: 'OTHER', confidence: KEYWORD_CONFIDENCE, hits: 0 });
  assert.equal(classifyByKeywords(null).category, 'OTHER');
});
