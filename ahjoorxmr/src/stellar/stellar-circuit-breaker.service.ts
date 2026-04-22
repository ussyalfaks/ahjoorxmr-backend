import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CircuitState {
  failures: number;
  lastFailureAt: number | null;
  isOpen: boolean;
}

@Injectable()
export class StellarCircuitBreakerService {
  private readonly logger = new Logger(StellarCircuitBreakerService.name);
  private readonly threshold: number;
  private readonly timeoutMs: number;
  private readonly networkName: string;
  private readonly webhookUrl: string | undefined;
  private state: CircuitState = { failures: 0, lastFailureAt: null, isOpen: false };

  constructor(private readonly configService: ConfigService) {
    this.threshold = this.configService.get<number>('STELLAR_CIRCUIT_BREAKER_THRESHOLD', 5);
    this.timeoutMs =
      this.configService.get<number>('STELLAR_CIRCUIT_BREAKER_TIMEOUT', 60) * 1000;
    this.networkName = this.configService.get<string>('STELLAR_NETWORK', 'testnet');
    this.webhookUrl = this.configService.get<string>('STELLAR_ALERT_WEBHOOK_URL');
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state.isOpen) {
      const elapsed = Date.now() - (this.state.lastFailureAt ?? 0);
      if (elapsed < this.timeoutMs) {
        throw new ServiceUnavailableException({
          error: 'Stellar network unavailable',
          retryAfter: Math.ceil((this.timeoutMs - elapsed) / 1000),
        });
      }
      // Half-open: allow one attempt
      this.logger.log('Circuit half-open, attempting recovery');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err as Error);
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state.isOpen) {
      this.logger.log('Circuit closed after successful recovery');
    }
    this.state = { failures: 0, lastFailureAt: null, isOpen: false };
  }

  private onFailure(err: Error): void {
    this.state.failures += 1;
    this.state.lastFailureAt = Date.now();

    if (this.state.failures >= this.threshold) {
      const wasOpen = this.state.isOpen;
      this.state.isOpen = true;

      if (!wasOpen) {
        this.logger.error(
          JSON.stringify({
            event: 'stellar_circuit_opened',
            network: this.networkName,
            failures: this.state.failures,
            lastError: err.message,
          }),
        );
        this.sendWebhookAlert(err.message).catch(() => {});
      }
    }
  }

  isOpen(): boolean {
    return this.state.isOpen;
  }

  getState(): CircuitState {
    return { ...this.state };
  }

  private async sendWebhookAlert(lastError: string): Promise<void> {
    if (!this.webhookUrl) return;
    try {
      const { default: fetch } = await import('node-fetch').catch(() => ({ default: null as any }));
      if (!fetch) return;
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'stellar_circuit_opened',
          network: this.networkName,
          lastError,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // Webhook failure is non-critical
    }
  }
}
