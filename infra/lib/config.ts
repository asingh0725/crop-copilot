export type EnvironmentName = 'dev' | 'prod';

export interface EnvironmentConfig {
  projectName: string;
  projectSlug: string;
  envName: EnvironmentName;
  accountId: string;
  region: string;
  metricsNamespace: string;
  monthlyBudgetUsd: number;
  maxRecommendationCostUsd: number;
  costAlertEmail?: string;
  tags: Record<string, string>;
}

const DEFAULT_BUDGETS: Record<EnvironmentName, number> = {
  dev: 10,
  prod: 50,
};

const DEFAULT_MAX_RECOMMENDATION_COST_USD: Record<EnvironmentName, number> = {
  dev: 1.5,
  prod: 1.1,
};

function parseEnvironmentName(raw: string | undefined): EnvironmentName {
  if (!raw) {
    return 'dev';
  }

  if (raw === 'dev' || raw === 'prod') {
    return raw;
  }

  throw new Error(
    `CROP_ENV must be one of dev or prod. Received: ${raw}`
  );
}

function parseMonthlyBudget(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`MONTHLY_BUDGET_USD must be a positive number. Received: ${raw}`);
  }

  return parsed;
}

function parsePositiveNumber(raw: string | undefined, fallback: number, name: string): number {
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number. Received: ${raw}`);
  }

  return parsed;
}

export function loadEnvironmentConfig(): EnvironmentConfig {
  const envName = parseEnvironmentName(process.env.CROP_ENV);
  const accountId = process.env.AWS_ACCOUNT_ID || process.env.CDK_DEFAULT_ACCOUNT;
  const region = process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || 'us-west-2';
  const metricsNamespace = process.env.METRICS_NAMESPACE || 'CropCopilot/Pipeline';

  if (!accountId) {
    throw new Error(
      'AWS account ID is required. Set AWS_ACCOUNT_ID or run CDK with an authenticated AWS profile.'
    );
  }

  const monthlyBudgetUsd = parseMonthlyBudget(
    process.env.MONTHLY_BUDGET_USD,
    DEFAULT_BUDGETS[envName]
  );
  const maxRecommendationCostUsd = parsePositiveNumber(
    process.env.MAX_RECOMMENDATION_COST_USD,
    DEFAULT_MAX_RECOMMENDATION_COST_USD[envName],
    'MAX_RECOMMENDATION_COST_USD'
  );

  const costAlertEmail = process.env.COST_ALERT_EMAIL || undefined;

  return {
    projectName: 'Crop Copilot',
    projectSlug: 'crop-copilot',
    envName,
    accountId,
    region,
    metricsNamespace,
    monthlyBudgetUsd,
    maxRecommendationCostUsd,
    costAlertEmail,
    tags: {
      Project: 'crop-copilot',
      Environment: envName,
      ManagedBy: 'cdk',
      Repository: 'crop-copilot',
    },
  };
}
