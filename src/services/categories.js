// Reason categories for floor notes. Labels live in the locale files under `categories.*`.
export const CATEGORIES = [
  'FABRIC_DELAY',
  'TRIMS_DELAY',
  'MACHINE_BREAKDOWN',
  'LABOUR_SHORTAGE',
  'POWER_CUT',
  'QUALITY_REWORK',
  'SUBCONTRACTOR_DELAY',
  'BUYER_APPROVAL_PENDING',
  'OTHER',
];

export const CATEGORY_DEFINITIONS = {
  FABRIC_DELAY: 'Fabric has not arrived, is short, or is late from the mill or dyeing',
  TRIMS_DELAY: 'Thread, buttons, labels, tags or other trims are missing or late',
  MACHINE_BREAKDOWN: 'Machines are broken, under repair, or waiting for a mechanic or parts',
  LABOUR_SHORTAGE: 'Workers absent, on leave, or not enough operators',
  POWER_CUT: 'No electricity or power interruptions stopped or reduced production',
  QUALITY_REWORK: 'Rejections, defects, colour mismatch or rework are reducing output',
  SUBCONTRACTOR_DELAY: 'Printing, washing or another outside unit has not returned pieces',
  BUYER_APPROVAL_PENDING: 'Waiting for buyer approval of a sample, lab dip, strike-off or change',
  OTHER: 'Anything else, or the note is unclear',
};

// Confidence bands shown as badges next to an AI suggestion.
export function confidenceBand(confidence) {
  if (confidence == null) return 'low';
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}
