import type { CostAnalysisResult, PremiumProcessingInput, SprayWindow } from './types';
import type { ComplianceEvaluationResult } from './compliance-engine';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Convert SNAKE_CASE or snake_case enum values to human-readable title case. */
function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Risk verdict → display label mapping. */
function riskLabel(value: string): string {
  switch (value.toLowerCase()) {
    case 'clear_signal':               return 'Clear Signal';
    case 'potential_conflict':         return 'Potential Conflict';
    case 'needs_manual_verification':  return 'Needs Verification';
    default:                           return humanizeEnum(value);
  }
}

/** Format an ISO timestamp string to a human-readable local time string. */
function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

/** Format a spray window time range cleanly. */
function formatSprayWindow(startsAt: string, endsAt: string): string {
  try {
    const s = new Date(startsAt);
    const e = new Date(endsAt);
    const dateStr = s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const startTime = s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const endTime = e.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${dateStr} · ${startTime} – ${endTime}`;
  } catch {
    return `${startsAt} – ${endsAt}`;
  }
}

function currency(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return 'N/A';
  }

  return `$${value.toFixed(2)}`;
}

function renderChecks(compliance: ComplianceEvaluationResult): string {
  return compliance.checks
    .map((check) => {
      const label = riskLabel(check.result ?? '');
      const colorClass =
        (check.result ?? '').toLowerCase() === 'clear_signal'
          ? 'badge-clear'
          : (check.result ?? '').toLowerCase() === 'potential_conflict'
          ? 'badge-warn'
          : 'badge-review';
      return `
        <tr>
          <td>${escapeHtml(check.title)}</td>
          <td><span class="badge ${colorClass}">${escapeHtml(label)}</span></td>
          <td>${escapeHtml(check.message)}</td>
        </tr>
      `;
    })
    .join('');
}

function renderCosts(costAnalysis: CostAnalysisResult | null): string {
  if (!costAnalysis) {
    return '<p>No cost analysis available.</p>';
  }

  const items = costAnalysis.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.productName)}</td>
          <td>${escapeHtml(item.applicationRate ?? 'N/A')}</td>
          <td>${currency(item.unitPriceUsd)}</td>
          <td>${currency(item.estimatedCostPerAcreUsd)}</td>
          <td>${currency(item.estimatedFieldCostUsd)}</td>
        </tr>
      `
    )
    .join('');

  return `
    <div class="cost-summary">
      <div class="cost-card">
        <div class="label">Cost Per Acre</div>
        <div class="value">${currency(costAnalysis.perAcreTotalUsd)}</div>
      </div>
      <div class="cost-card">
        <div class="label">Whole Field Total</div>
        <div class="value">${currency(costAnalysis.wholeFieldTotalUsd)}</div>
      </div>
      <div class="cost-card">
        <div class="label">Pricing Coverage</div>
        <div class="value">${costAnalysis.pricedItemCount}/${costAnalysis.totalItemCount}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Product</th>
          <th>Rate</th>
          <th>Unit Price</th>
          <th>Per Acre</th>
          <th>Whole Field</th>
        </tr>
      </thead>
      <tbody>${items}</tbody>
    </table>
  `;
}

function renderSprayWindows(windows: SprayWindow[]): string {
  if (windows.length === 0) {
    return '<p>No spray windows available.</p>';
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Window</th>
          <th>Score</th>
          <th>Summary</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        ${windows
          .map((window) => {
            const score = window.score ?? 0;
            const barColor = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626';
            return `
              <tr>
                <td>${escapeHtml(formatSprayWindow(window.startsAt, window.endsAt))}</td>
                <td>
                  <span class="score-bar"><span class="score-fill" style="width:${score}%;background:${barColor}"></span></span>
                  <strong>${score}</strong>/100
                </td>
                <td>${escapeHtml(window.summary)}</td>
                <td>${escapeHtml(window.source)}</td>
              </tr>
            `;
          })
          .join('')}
      </tbody>
    </table>
  `;
}

export function buildApplicationReportHtml(params: {
  input: PremiumProcessingInput;
  compliance: ComplianceEvaluationResult;
  costAnalysis: CostAnalysisResult | null;
  sprayWindows: SprayWindow[];
}): string {
  const { input, compliance, costAnalysis, sprayWindows } = params;

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Application Prep Packet - ${escapeHtml(input.recommendationId)}</title>
    <style>
      :root { --green: #16a34a; --amber: #d97706; --orange: #ea580c; --gray: #4b5563; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 28px 32px; color: #1f2937; background: #f9fafb; }
      .page { max-width: 860px; margin: 0 auto; }
      h1 { font-size: 24px; font-weight: 700; margin: 0 0 4px; color: #111827; }
      h2 { font-size: 16px; font-weight: 700; margin: 28px 0 10px; color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; }
      .meta { color: #6b7280; font-size: 13px; margin: 0 0 20px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.07); }
      th, td { padding: 10px 14px; text-align: left; vertical-align: top; font-size: 14px; }
      th { background: #f3f4f6; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; }
      td { border-bottom: 1px solid #f3f4f6; }
      tr:last-child td { border-bottom: none; }
      .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: .02em; }
      .badge-clear  { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
      .badge-warn   { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
      .badge-review { background: #ffedd5; color: #9a3412; border: 1px solid #fed7aa; }
      .verdict-block { display: flex; align-items: center; gap: 10px; margin: 10px 0 18px; padding: 14px 18px; border-radius: 10px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.07); }
      .verdict-label { font-size: 15px; font-weight: 700; }
      .muted { color: #6b7280; font-size: 13px; }
      .cost-summary { display: flex; gap: 20px; margin: 10px 0 16px; }
      .cost-card { flex: 1; padding: 14px 18px; border-radius: 10px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.07); }
      .cost-card .value { font-size: 22px; font-weight: 700; color: #111827; margin: 4px 0 0; }
      .cost-card .label { font-size: 12px; color: #6b7280; font-weight: 500; }
      ul.checklist { margin: 0; padding: 0 0 0 20px; line-height: 1.9; font-size: 14px; }
      .advisory { margin-top: 8px; padding: 14px 18px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; font-size: 13px; color: #78350f; }
      .score-bar { display: inline-block; width: 60px; height: 6px; border-radius: 3px; vertical-align: middle; background: #e5e7eb; position: relative; margin-right: 6px; }
      .score-fill { height: 100%; border-radius: 3px; }
    </style>
  </head>
  <body>
  <div class="page">
    <h1>Application Prep Packet</h1>
    <p class="meta">Generated ${formatTimestamp(new Date().toISOString())}</p>

    <h2>Application Risk Review</h2>
    ${(() => {
      const rv = compliance.riskReview ?? '';
      const label = riskLabel(rv);
      const cls = rv.toLowerCase() === 'clear_signal' ? 'badge-clear' : rv.toLowerCase() === 'potential_conflict' ? 'badge-warn' : 'badge-review';
      return `<div class="verdict-block"><span class="badge ${cls}">${escapeHtml(label)}</span><span class="verdict-label">${escapeHtml(label)}</span></div>`;
    })()}
    <table>
      <thead><tr><th>Check</th><th>Result</th><th>Details</th></tr></thead>
      <tbody>
        ${renderChecks(compliance)}
      </tbody>
    </table>

    <h2>Cost Analysis</h2>
    ${renderCosts(costAnalysis)}

    <h2>Spray Windows</h2>
    ${renderSprayWindows(sprayWindows)}

    <h2>Before You Apply — Checklist</h2>
    <ul class="checklist">
      <li>Confirm current product label and approved use-site instructions.</li>
      <li>Confirm crop-stage allowances for this application timing.</li>
      <li>Confirm state and local pesticide restrictions before application.</li>
      <li>Check for applicable endangered species bulletin requirements.</li>
    </ul>

    <h2>Advisory Notice</h2>
    <div class="advisory">
      This packet is decision support only and does not constitute legal approval. The grower and/or certified applicator remains solely responsible for final application decisions and label compliance.
    </div>
  </div>
  </body>
</html>
  `.trim();
}
