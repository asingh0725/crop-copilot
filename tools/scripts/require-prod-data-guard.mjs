#!/usr/bin/env node

const required = [
  ['PROD_CHANGE_REQUEST', 'Describe the exact requested production data change.'],
  ['PROD_SNAPSHOT_ID', 'Provide the fresh manual RDS snapshot identifier.'],
  ['PROD_LOGICAL_BACKUP_PATH', 'Provide the fresh pg_dump path.'],
  ['PROD_DRY_RUN_SUMMARY', 'Provide the dry-run row-count summary.'],
  ['PROD_CHANGE_APPROVED', 'Set to YES to confirm the change passed all guardrails.'],
];

const missing = required.filter(([key]) => !process.env[key] || process.env[key].trim().length === 0);
const approved = process.env.PROD_CHANGE_APPROVED === 'YES';

if (missing.length > 0 || !approved) {
  const problems = [
    ...missing.map(([key, message]) => `${key}: ${message}`),
    ...(approved ? [] : ['PROD_CHANGE_APPROVED: Must equal YES']),
  ];

  console.error(
    JSON.stringify(
      {
        status: 'blocked',
        message: 'Production data mutation guardrail not satisfied.',
        problems,
      },
      null,
      2
    )
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: 'pass',
      message: 'Production data mutation guardrail satisfied.',
      snapshotId: process.env.PROD_SNAPSHOT_ID,
      backupPath: process.env.PROD_LOGICAL_BACKUP_PATH,
    },
    null,
    2
  )
);
