import type { SeedResult } from '../index';
import { runGatewayUsageLiveCheck } from '../lib/gateway-usage';

export const usage = '';

function printUsage(): void {
  console.log('Usage: pnpm dev:seed app:gateway-usage');
  console.log('');
  console.log('Seeds stable gateway usage rows and checks the local usage API.');
}

export async function run(...args: string[]): Promise<SeedResult | void> {
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }
  if (args.length > 0) {
    printUsage();
    throw new Error(`Unexpected arguments: ${args.join(' ')}`);
  }

  return runGatewayUsageLiveCheck();
}
