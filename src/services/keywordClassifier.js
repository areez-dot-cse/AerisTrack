// Offline fallback for the AI: counts keyword hits per category. The highest
// count wins and no hits means OTHER. Confidence is fixed at 0.4 so every
// keyword result lands in the review inbox (assumption A13: list needs a
// native speaker's review).
const KEYWORDS = {
  POWER_CUT: ['மின்சாரம்', 'கரண்ட்', 'பவர்', 'power', 'current', 'electricity'],
  MACHINE_BREAKDOWN: ['மெஷின்', 'பழுது', 'ரிப்பேர்', 'machine', 'breakdown', 'repair', 'needle'],
  LABOUR_SHORTAGE: ['ஆட்கள்', 'ஆள்', 'லீவு', 'வரவில்லை', 'labour', 'absent', 'leave', 'workers'],
  FABRIC_DELAY: ['துணி', 'ஃபேப்ரிக்', 'fabric', 'cloth'],
  TRIMS_DELAY: ['நூல்', 'பட்டன்', 'லேபிள்', 'thread', 'button', 'label', 'trims'],
  QUALITY_REWORK: ['ரீவொர்க்', 'ரிஜெக்ட்', 'சரியில்லை', 'குறை', 'rework', 'reject', 'defect'],
  SUBCONTRACTOR_DELAY: ['பிரிண்டிங்', 'வாஷிங்', 'printing', 'washing', 'subcontract'],
  BUYER_APPROVAL_PENDING: ['ஒப்புதல்', 'அப்ரூவல்', 'approval', 'buyer'],
};

export const KEYWORD_CONFIDENCE = 0.4;

export function classifyByKeywords(text) {
  const haystack = (text ?? '').toLowerCase();
  let best = { category: 'OTHER', hits: 0 };
  for (const [category, words] of Object.entries(KEYWORDS)) {
    const hits = words.filter((word) => haystack.includes(word.toLowerCase())).length;
    if (hits > best.hits) best = { category, hits };
  }
  return { category: best.category, confidence: KEYWORD_CONFIDENCE, hits: best.hits };
}
