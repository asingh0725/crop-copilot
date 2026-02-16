export type EnvironmentName = 'dev' | 'staging' | 'prod';

export interface EnvironmentConfig {
  projectName: string;
  projectSlug: string;
  envName: EnvironmentName;
  accountId: string;
  region: string;
  monthlyBudgetUsd: number;
  costAlertEmail?: string;
  tags: Record<string, string>;
}

const DEFAULT_BUDGETS: Record<EnvironmentName, number> = {
  dev: 150,
  staging: 350,
  prod: 1000,
};

function parseEnvironmentName(raw: string | undefined): EnvironmentName {
  if (!raw) {
    return 'dev';
  }

  if (raw === 'dev' || raw === 'staging' || raw === 'prod') {
    return raw;
  }

  throw new Error(
    `CROP_ENV must be one of dev, staging, or prod. Received: ${raw}`
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

export function loadEnvironmentConfig(): EnvironmentConfig {
  const envName = parseEnvironmentName(process.env.CROP_ENV);
  const accountId = process.env.AWS_ACCOUNT_ID || process.env.CDK_DEFAULT_ACCOUNT;
  const region = process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || 'ca-west-1';

  if (!accountId) {
    throw new Error(
      'AWS account ID is required. Set AWS_ACCOUNT_ID or run CDK with an authenticated AWS profile.'
    );
  }

  const monthlyBudgetUsd = parseMonthlyBudget(
    process.env.MONTHLY_BUDGET_USD,
    DEFAULT_BUDGETS[envName]
  );

  const costAlertEmail = process.env.COST_ALERT_EMAIL || undefined;

  return {
    projectName: 'Crop Copilot',
    projectSlug: 'crop-copilot',
    envName,
    accountId,
    region,
    monthlyBudgetUsd,
    costAlertEmail,
    tags: {
      Project: 'crop-copilot',
      Environment: envName,
      ManagedBy: 'cdk',
      Repository: 'crop-copilot',
    },
  };
}
