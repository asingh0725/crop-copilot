export interface RecommendationMetricPayload {
  status: 'completed' | 'failed';
  durationMs: number;
  estimatedCostUsd: number;
  traceId?: string;
  modelUsed?: string;
}

interface EmbeddedMetricFormat {
  _aws: {
    Timestamp: number;
    CloudWatchMetrics: Array<{
      Namespace: string;
      Dimensions: string[][];
      Metrics: Array<{ Name: string; Unit: string }>;
    }>;
  };
  Service: string;
  Environment: string;
  Pipeline: string;
  Status: RecommendationMetricPayload['status'];
  TraceId: string;
  ModelUsed: string;
  RecommendationDurationMs: number;
  RecommendationEstimatedCostUsd: number;
  RecommendationCompletedCount: number;
  RecommendationFailedCount: number;
}

export function buildRecommendationMetricLog(
  payload: RecommendationMetricPayload,
  now: Date = new Date()
): EmbeddedMetricFormat {
  const namespace = process.env.METRICS_NAMESPACE ?? 'CropCopilot/Pipeline';

  return {
    _aws: {
      Timestamp: now.getTime(),
      CloudWatchMetrics: [
        {
          Namespace: namespace,
          Dimensions: [['Service', 'Environment', 'Pipeline', 'Status']],
          Metrics: [
            { Name: 'RecommendationDurationMs', Unit: 'Milliseconds' },
            { Name: 'RecommendationEstimatedCostUsd', Unit: 'None' },
            { Name: 'RecommendationCompletedCount', Unit: 'Count' },
            { Name: 'RecommendationFailedCount', Unit: 'Count' },
          ],
        },
      ],
    },
    Service: 'api',
    Environment: process.env.CROP_ENV ?? 'dev',
    Pipeline: 'recommendation',
    Status: payload.status,
    TraceId: payload.traceId ?? 'unknown',
    ModelUsed: payload.modelUsed ?? 'unknown',
    RecommendationDurationMs: payload.durationMs,
    RecommendationEstimatedCostUsd: payload.estimatedCostUsd,
    RecommendationCompletedCount: payload.status === 'completed' ? 1 : 0,
    RecommendationFailedCount: payload.status === 'failed' ? 1 : 0,
  };
}

export function emitRecommendationMetrics(payload: RecommendationMetricPayload): void {
  console.log(JSON.stringify(buildRecommendationMetricLog(payload)));
}
