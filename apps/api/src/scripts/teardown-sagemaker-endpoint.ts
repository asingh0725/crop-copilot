import {
  DeleteEndpointCommand,
  DescribeEndpointCommand,
  DescribeEndpointConfigCommand,
  SageMakerClient,
} from '@aws-sdk/client-sagemaker';

function parseArg(flag: string): string | null {
  const index = process.argv.findIndex((arg) => arg === flag);
  if (index < 0) {
    return null;
  }
  const value = process.argv[index + 1]?.trim();
  return value && value.length > 0 ? value : null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main(): Promise<void> {
  const region = process.env.AWS_REGION?.trim() || 'us-west-2';
  const endpointName = parseArg('--endpoint') ?? process.env.SAGEMAKER_ENDPOINT_NAME?.trim();
  const dryRun = hasFlag('--dry-run');

  if (!endpointName) {
    throw new Error('Provide --endpoint or set SAGEMAKER_ENDPOINT_NAME.');
  }

  const client = new SageMakerClient({ region });

  let endpointConfigName: string | null = null;
  let modelNames: string[] = [];
  let endpointStatus: string | null = null;

  try {
    const endpoint = await client.send(
      new DescribeEndpointCommand({
        EndpointName: endpointName,
      })
    );
    endpointStatus = endpoint.EndpointStatus ?? null;
    endpointConfigName = endpoint.EndpointConfigName ?? null;
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          endpointName,
          region,
          dryRun,
          found: false,
          message: (error as Error).message,
        },
        null,
        2
      )
    );
    return;
  }

  if (endpointConfigName) {
    try {
      const config = await client.send(
        new DescribeEndpointConfigCommand({
          EndpointConfigName: endpointConfigName,
        })
      );
      modelNames = (config.ProductionVariants ?? [])
        .map((variant) => variant.ModelName ?? '')
        .filter((value) => value.length > 0);
    } catch {
      // best effort
    }
  }

  if (!dryRun) {
    await client.send(
      new DeleteEndpointCommand({
        EndpointName: endpointName,
      })
    );
  }

  console.log(
    JSON.stringify(
      {
        endpointName,
        region,
        dryRun,
        found: true,
        endpointStatus,
        endpointConfigName,
        modelNames,
        action: dryRun ? 'inspect_only' : 'delete_endpoint_requested',
        nextStep:
          'After the endpoint reaches Deleted/does not exist, remove any orphaned endpoint configs and models if they remain.',
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('[TeardownSageMakerEndpoint] fatal', {
    error: (error as Error).message,
  });
  process.exitCode = 1;
});
