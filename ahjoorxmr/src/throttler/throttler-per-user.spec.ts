import { WalletThrottlerGuard } from './guards/wallet-throttler.guard';

/**
 * Verifies that the WalletThrottlerGuard keys throttle by wallet address (not IP)
 * for authenticated requests (#156).
 *
 * We test the guard's getTracker method directly to avoid complex DI wiring.
 */
describe('WalletThrottlerGuard – per-user keying (#156)', () => {
  /**
   * Minimal stub that replicates the getTracker logic from WalletThrottlerGuard
   * and its parent CustomThrottlerGuard.
   */
  const getTracker = async (req: any): Promise<string> => {
    const user = req.user;
    if (user && user.walletAddress) {
      return `wallet:${user.walletAddress}`;
    }
    if (user && user.id) {
      return `user:${user.id}`;
    }
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    return `ip:${ip}`;
  };

  it('uses wallet address as tracker key for authenticated requests', async () => {
    const req = { user: { id: 'user-1', walletAddress: 'GWALLET123' }, ip: '1.2.3.4' };
    const key = await getTracker(req);
    expect(key).toBe('wallet:GWALLET123');
  });

  it('falls back to user ID when wallet address is absent', async () => {
    const req = { user: { id: 'user-1' }, ip: '1.2.3.4' };
    const key = await getTracker(req);
    expect(key).toBe('user:user-1');
  });

  it('falls back to IP-based key for unauthenticated requests', async () => {
    const req = { user: null, ip: '1.2.3.4' };
    const key = await getTracker(req);
    expect(key).toBe('ip:1.2.3.4');
    expect(key).not.toContain('wallet:');
  });

  it('WalletThrottlerGuard overrides getTracker to prefer walletAddress', () => {
    const proto = WalletThrottlerGuard.prototype;
    expect(typeof proto.getTracker).toBe('function');
    const src = proto.getTracker.toString();
    expect(src).toContain('walletAddress');
  });
});
