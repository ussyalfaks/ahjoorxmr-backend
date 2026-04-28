import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GroupsService } from './groups.service';
import { Group } from './entities/group.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { PayoutOrderStrategy } from './entities/payout-order-strategy.enum';
import { WinstonLogger } from '../common/logger/winston.logger';
import { NotificationsService } from '../notification/notifications.service';
import { StellarService } from '../stellar/stellar.service';
import { AuditService } from '../audit/audit.service';
import { MembershipStatus } from '../memberships/entities/membership-status.enum';

describe('GroupsService', () => {
  let service: GroupsService;
  let groupRepository: Repository<Group>;
  let membershipRepository: Repository<Membership>;
  let notificationsService: NotificationsService;
  let stellarService: StellarService;
  let auditService: AuditService;
  let dataSource: DataSource;

  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    setContext: jest.fn(),
  };

  const mockNotificationsService = {
    notifyBatch: jest.fn(),
  };

  const mockStellarService = {
    deployRoscaContract: jest.fn().mockResolvedValue('contract-address'),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockAuditService = {
    createLog: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn().mockImplementation((cb) => cb({
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
    })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupsService,
        {
          provide: getRepositoryToken(Group),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
          },
        },
        {
          provide: getRepositoryToken(Membership),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
          },
        },
        {
          provide: WinstonLogger,
          useValue: mockLogger,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
        {
          provide: StellarService,
          useValue: mockStellarService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<GroupsService>(GroupsService);
    groupRepository = module.get<Repository<Group>>(getRepositoryToken(Group));
    membershipRepository = module.get<Repository<Membership>>(
      getRepositoryToken(Membership),
    );
    notificationsService = module.get<NotificationsService>(NotificationsService);
    stellarService = module.get<StellarService>(StellarService);
    auditService = module.get<AuditService>(AuditService);
    dataSource = module.get<DataSource>(DataSource);
  });

  describe('activateGroup', () => {
    it('should throw NotFoundException if group does not exist', async () => {
      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(null);

      await expect(service.activateGroup('non-existent-id', 'admin-wallet')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if group is already active', async () => {
      const group = {
        id: 'group-1',
        status: 'ACTIVE',
        adminWallet: 'admin-wallet',
        payoutOrderStrategy: PayoutOrderStrategy.SEQUENTIAL,
      } as Group;

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);

      await expect(service.activateGroup('group-1', 'admin-wallet')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if group has no members', async () => {
      const group = {
        id: 'group-1',
        status: 'PENDING',
        adminWallet: 'admin-wallet',
        minMembers: 1,
        payoutOrderStrategy: PayoutOrderStrategy.SEQUENTIAL,
        memberships: [],
      } as Group;

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);

      await expect(service.activateGroup('group-1', 'admin-wallet')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should activate group with SEQUENTIAL strategy without changes', async () => {
      const group = {
        id: 'group-1',
        status: 'PENDING',
        adminWallet: 'admin-wallet',
        minMembers: 1,
        payoutOrderStrategy: PayoutOrderStrategy.SEQUENTIAL,
        memberships: [
          { id: 'm1', payoutOrder: 0 } as Membership,
        ],
      } as Group;

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);
      jest.spyOn(groupRepository, 'save').mockResolvedValue({
        ...group,
        status: 'ACTIVE',
      } as any);

      const result = await service.activateGroup('group-1', 'admin-wallet');

      expect(result.status).toBe('ACTIVE');
    });

    it('should randomize payout order with RANDOM strategy', async () => {
      const group = {
        id: 'group-1',
        status: 'PENDING',
        adminWallet: 'admin-wallet',
        minMembers: 1,
        payoutOrderStrategy: PayoutOrderStrategy.RANDOM,
        memberships: [
          { id: 'm1', payoutOrder: null } as Membership,
          { id: 'm2', payoutOrder: null } as Membership,
          { id: 'm3', payoutOrder: null } as Membership,
        ],
      } as Group;

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);
      jest.spyOn(groupRepository, 'save').mockResolvedValue({
        ...group,
        status: 'ACTIVE',
      } as any);

      await service.activateGroup('group-1', 'admin-wallet');

      // Verify that save was called for each member
      expect(membershipRepository.save).toHaveBeenCalledTimes(3);

      // Verify that all members have assigned payout orders
      const savedMembers = group.memberships.filter((m) => m.payoutOrder !== null);
      expect(savedMembers.length).toBe(3);
    });

    it('should validate ADMIN_DEFINED strategy with complete orders', async () => {
      const group = {
        id: 'group-1',
        status: 'PENDING',
        adminWallet: 'admin-wallet',
        minMembers: 1,
        payoutOrderStrategy: PayoutOrderStrategy.ADMIN_DEFINED,
        memberships: [
          { id: 'm1', payoutOrder: 0 } as Membership,
          { id: 'm2', payoutOrder: 1 } as Membership,
          { id: 'm3', payoutOrder: 2 } as Membership,
        ],
      } as Group;

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);
      jest.spyOn(groupRepository, 'save').mockResolvedValue({
        ...group,
        status: 'ACTIVE',
      } as any);

      const result = await service.activateGroup('group-1', 'admin-wallet');

      expect(result.status).toBe('ACTIVE');
    });

    it('should throw BadRequestException for ADMIN_DEFINED with null orders', async () => {
      const group = {
        id: 'group-1',
        status: 'PENDING',
        adminWallet: 'admin-wallet',
        minMembers: 1,
        payoutOrderStrategy: PayoutOrderStrategy.ADMIN_DEFINED,
        memberships: [
          { id: 'm1', payoutOrder: 0 } as Membership,
          { id: 'm2', payoutOrder: null } as Membership,
          { id: 'm3', payoutOrder: 2 } as Membership,
        ],
      } as Group;

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);

      await expect(service.activateGroup('group-1', 'admin-wallet')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for ADMIN_DEFINED with missing positions', async () => {
      const group = {
        id: 'group-1',
        status: 'PENDING',
        adminWallet: 'admin-wallet',
        minMembers: 1,
        payoutOrderStrategy: PayoutOrderStrategy.ADMIN_DEFINED,
        memberships: [
          { id: 'm1', payoutOrder: 0 } as Membership,
          { id: 'm2', payoutOrder: 1 } as Membership,
          { id: 'm3', payoutOrder: 5 } as Membership, // Gap in sequence
        ],
      } as Group;

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);

      await expect(service.activateGroup('group-1', 'admin-wallet')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for ADMIN_DEFINED with duplicate positions', async () => {
      const group = {
        id: 'group-1',
        status: 'PENDING',
        adminWallet: 'admin-wallet',
        minMembers: 1,
        payoutOrderStrategy: PayoutOrderStrategy.ADMIN_DEFINED,
        memberships: [
          { id: 'm1', payoutOrder: 0 } as Membership,
          { id: 'm2', payoutOrder: 1 } as Membership,
          { id: 'm3', payoutOrder: 1 } as Membership, // Duplicate
        ],
      } as Group;

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);

      await expect(service.activateGroup('group-1', 'admin-wallet')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('transferAdmin', () => {
    it('should throw NotFoundException if group does not exist', async () => {
      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.transferAdmin('group-1', 'admin-1', { newAdminUserId: 'new-admin-id' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if requester is not the current admin', async () => {
      const group = {
        id: 'group-1',
        adminWallet: 'admin-1',
      } as Group;

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);

      await expect(
        service.transferAdmin('group-1', 'not-admin', { newAdminUserId: 'new-admin-id' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if new admin is not an active member', async () => {
      const group = {
        id: 'group-1',
        adminWallet: 'admin-1',
      } as Group;

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);
      jest.spyOn(membershipRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.transferAdmin('group-1', 'admin-1', { newAdminUserId: 'not-member' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should transfer admin ownership successfully', async () => {
      const group = {
        id: 'group-1',
        name: 'Test Group',
        adminWallet: 'admin-1',
      } as Group;

      const newAdminMembership = {
        userId: 'new-admin-id',
        walletAddress: 'new-admin-wallet',
        status: MembershipStatus.ACTIVE,
      } as Membership;

      const oldAdminMembership = {
        userId: 'old-admin-id',
        walletAddress: 'admin-1',
        status: MembershipStatus.ACTIVE,
      } as Membership;

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);
      jest.spyOn(membershipRepository, 'findOne')
        .mockResolvedValueOnce(newAdminMembership) // First call for new admin
        .mockResolvedValueOnce(oldAdminMembership); // Second call for old admin

      const result = await service.transferAdmin('group-1', 'admin-1', {
        newAdminUserId: 'new-admin-id',
      });

      expect(result.adminWallet).toBe('new-admin-wallet');
      expect(mockAuditService.createLog).toHaveBeenCalled();
      expect(mockNotificationsService.notifyBatch).toHaveBeenCalled();
    });
  });
});
