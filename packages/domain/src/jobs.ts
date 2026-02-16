import type { JobStatus } from '@crop-copilot/contracts';

const STATUS_SEQUENCE: JobStatus[] = [
  'queued',
  'retrieving_context',
  'generating_recommendation',
  'validating_output',
  'persisting_result',
  'completed',
];

const TERMINAL_STATUSES = new Set<JobStatus>(['completed', 'failed']);

export function canTransitionJobStatus(from: JobStatus, to: JobStatus): boolean {
  if (from === to) {
    return true;
  }

  if (TERMINAL_STATUSES.has(from)) {
    return false;
  }

  if (to === 'failed') {
    return true;
  }

  const fromIndex = STATUS_SEQUENCE.indexOf(from);
  const toIndex = STATUS_SEQUENCE.indexOf(to);

  if (fromIndex < 0 || toIndex < 0) {
    return false;
  }

  return toIndex === fromIndex + 1;
}

export function nextJobStatus(current: JobStatus): JobStatus {
  if (current === 'failed' || current === 'completed') {
    return current;
  }

  const currentIndex = STATUS_SEQUENCE.indexOf(current);
  if (currentIndex < 0) {
    return 'failed';
  }

  const next = STATUS_SEQUENCE[currentIndex + 1];
  return next ?? 'completed';
}

export function isTerminalJobStatus(status: JobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
