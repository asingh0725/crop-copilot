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

function currency(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return 'N/A';
  }

  return `$${value.toFixed(2)}`;
}

function renderChecks(compliance: ComplianceEvaluationResult): string {
  return compliance.checks
    .map(
      (check) => `
        <tr>
          <td>${escapeHtml(check.title)}</td>
          <td><strong>${escapeHtml(check.result.toUpperCase())}</strong></td>
          <td>${escapeHtml(check.message)}</td>
        </tr>
      `
    )
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
    <p><strong>Total per acre:</strong> ${currency(costAnalysis.perAcreTotalUsd)}</p>
    <p><strong>Total whole field:</strong> ${currency(costAnalysis.wholeFieldTotalUsd)}</p>
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
          .map(
            (window) => `
              <tr>
                <td>${escapeHtml(window.startsAt)} - ${escapeHtml(window.endsAt)}</td>
                <td>${window.score}</td>
                <td>${escapeHtml(window.summary)}</td>
                <td>${escapeHtml(window.source)}</td>
              </tr>
            `
          )
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
      body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; margin: 24px; color: #1f2937; }
      h1, h2 { margin: 0 0 12px; }
      h1 { font-size: 22px; }
      h2 { font-size: 18px; margin-top: 24px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
      th { background: #f3f4f6; }
      .badge { display: inline-block; padding: 4px 8px; border-radius: 999px; background: #e5e7eb; font-weight: 700; }
      .muted { color: #6b7280; font-size: 13px; }
    </style>
  </head>
  <body>
    <h1>Application Prep Packet</h1>
    <p class="muted">Recommendation ID: ${escapeHtml(input.recommendationId)}</p>
    <p class="muted">Generated at: ${new Date().toISOString()}</p>

    <h2>Application Risk Review</h2>
    <p><span class="badge">${escapeHtml(compliance.riskReview.toUpperCase())}</span></p>
    <table>
      <thead><tr><th>Check</th><th>Result</th><th>Why</th></tr></thead>
      <tbody>
        ${renderChecks(compliance)}
      </tbody>
    </table>

    <h2>Cost Analysis</h2>
    ${renderCosts(costAnalysis)}

    <h2>Spray Windows</h2>
    ${renderSprayWindows(sprayWindows)}

    <h2>Manual Verification Checklist</h2>
    <ul>
      <li>Confirm current product label and use-site instructions.</li>
      <li>Confirm crop-stage allowances for this application timing.</li>
      <li>Confirm state and local restrictions before application.</li>
      <li>Confirm endangered species bulletin requirements where applicable.</li>
    </ul>

    <h2>Advisory Notice</h2>
    <p class="muted">
      This packet is decision support only and does not provide legal approval. The grower/applicator remains responsible for final application decisions and label compliance.
    </p>
  </body>
</html>
  `.trim();
}
