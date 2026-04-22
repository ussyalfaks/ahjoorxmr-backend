import { SetMetadata } from '@nestjs/common';

export interface AuditLogOptions {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'READ';
  resource: string;
  excludeFields?: string[]; // Fields to exclude from audit (e.g., password, refreshTokenHash)
}

export const AUDIT_LOG_METADATA_KEY = 'audit:log';

/**
 * Decorator to mark endpoints for audit logging
 * @param options Configuration for audit logging
 *
 * @example
 * @AuditLog({ action: 'UPDATE', resource: 'GROUP' })
 * @Patch(':id')
 * async updateGroup(@Param('id') id: string, @Body() dto: UpdateGroupDto) {
 *   return this.groupsService.update(id, dto);
 * }
 */
export function AuditLogDecorator(options: AuditLogOptions) {
  return SetMetadata(AUDIT_LOG_METADATA_KEY, options);
}
