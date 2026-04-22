import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import * as http from 'http';

@Injectable()
export class StellarHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(StellarHealthIndicator.name);
  private readonly rpcUrl: string;
  private readonly horizonUrl: string;

  constructor(private readonly configService: ConfigService) {
    super();
    this.rpcUrl = this.configService.get<string>('STELLAR_RPC_URL', '');
    this.horizonUrl = this.configService.get<string>(
      'STELLAR_HORIZON_URL',
      'https://horizon-testnet.stellar.org',
    );
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const results: Record<string, { status: string; error?: string }> = {};
    let isHealthy = true;

    // Check Horizon API
    try {
      await this.pingUrl(this.horizonUrl);
      results['horizon'] = { status: 'up' };
    } catch (err) {
      isHealthy = false;
      results['horizon'] = { status: 'down', error: (err as Error).message };
      this.logger.warn(`Horizon health check failed: ${(err as Error).message}`);
    }

    // Check Soroban RPC
    if (this.rpcUrl) {
      try {
        await this.checkSorobanRpc(this.rpcUrl);
        results['sorobanRpc'] = { status: 'up' };
      } catch (err) {
        isHealthy = false;
        results['sorobanRpc'] = { status: 'down', error: (err as Error).message };
        this.logger.warn(`Soroban RPC health check failed: ${(err as Error).message}`);
      }
    }

    const result = this.getStatus(key, isHealthy, results);
    if (!isHealthy) {
      throw new HealthCheckError('Stellar health check failed', result);
    }
    return result;
  }

  private pingUrl(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, { timeout: 5000 }, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
        res.resume();
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });
    });
  }

  private checkSorobanRpc(rpcUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth', params: [] });
      const url = new URL(rpcUrl);
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 5000,
      };
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request(options, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
        res.resume();
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('RPC request timed out'));
      });
      req.write(body);
      req.end();
    });
  }
}
