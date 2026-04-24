import { SetMetadata } from '@nestjs/common';

export const USE_READ_REPLICA_KEY = 'use_read_replica';

/**
 * Decorator to indicate that a service method should perform its database queries
 * using the read replica if available.
 */
export const UseReadReplica = () => SetMetadata(USE_READ_REPLICA_KEY, true);
