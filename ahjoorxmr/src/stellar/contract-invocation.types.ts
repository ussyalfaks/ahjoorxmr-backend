/**
 * Structured outcome from a Soroban `simulateTransaction` contract read (invokeContractMethod).
 */
export type ContractInvocationResult = {
  /** Return value converted with `scValToNative`, when available */
  nativeValue: unknown;
  /** Raw base64 XDR return value from simulation, if present */
  rawResultXdr?: string;
  /** Wall-clock time spent in RPC simulation(s) only, milliseconds */
  simulationLatencyMs: number;
  /** Number of RPC attempts (includes retries) */
  attempts: number;
};
