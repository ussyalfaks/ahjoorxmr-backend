import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';

export interface CreateAuditLogDto {
  userId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'READ';
  resource: string;
  resourceId: string;
  previousValue?: Record<string, any>;
  newValue?: Record<string, any>;
  endpoint?: string;
  method?: string;
  ipAddress?: string;
  statusCode?: number;
  errorMessage?: string;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Create an audit log entry
   */
  async create(dto: CreateAuditLogDto): Promise<AuditLog> {
    const auditLog = this.auditLogRepository.create(dto);
    return this.auditLogRepository.save(auditLog);
  }

  /**
   * Get audit logs for a specific resource
   */
  async findByResource(
    resource: string,
    resourceId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ data: AuditLog[]; total: number }> {
    const [data, total] = await this.auditLogRepository.findAndCount({
      where: { resource, resourceId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { data, total };
  }

  /**
   * Get audit logs for a specific user
   */
  async findByUser(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ data: AuditLog[]; total: number }> {
    const [data, total] = await this.auditLogRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { data, total };
  }

  /**
   * Get all audit logs with optional filtering
   */
  async findAll(options?: {
    resource?: string;
    resourceId?: string;
    userId?: string;
    action?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: AuditLog[]; total: number }> {
    const {
      resource,
      resourceId,
      userId,
      action,
      limit = 50,
      offset = 0,
    } = options || {};

    const query = this.auditLogRepository.createQueryBuilder('audit');

    if (resource) {
      query.andWhere('audit.resource = :resource', { resource });
    }

    if (resourceId) {
      query.andWhere('audit.resourceId = :resourceId', { resourceId });
    }

    if (userId) {
      query.andWhere('audit.userId = :userId', { userId });
    }

    if (action) {
      query.andWhere('audit.action = :action', { action });
    }

    query.orderBy('audit.createdAt', 'DESC');
    query.take(limit);
    query.skip(offset);

    const [data, total] = await query.getManyAndCount();

    return { data, total };
  }

  /**
   * Get audit log by ID
   */
  async findById(id: string): Promise<AuditLog | null> {
    return this.auditLogRepository.findOne({ where: { id } });
  }
}
