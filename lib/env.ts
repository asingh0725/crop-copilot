export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}
