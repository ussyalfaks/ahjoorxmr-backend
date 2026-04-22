import { Injectable, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { CustomThrottlerGuard } from './custom-throttler.guard';

/**
 * Throttler guard that uses the user's wallet address as the throttle key.
 * Used to prevent abuse of sensitive endpoints by a single wallet.
 */
@Injectable()
export class WalletThrottlerGuard extends CustomThrottlerGuard {
  /**
   * Get tracker key for rate limiting.
   * Uses request.user.walletAddress if available, otherwise falls back to
   * the standard user ID or IP-based tracking from the parent guard.
   *
   * @param req - The express request object
   * @returns The throttle key
   */
  protected async getTracker(req: Request): Promise<string> {
    const user = (req as any).user;

    // Use wallet address if authenticated and available
    if (user && user.walletAddress) {
      return `wallet:${user.walletAddress}`;
    }

    // Fall back to standard tracking (user ID or IP)
    return super.getTracker(req);
  }
}
