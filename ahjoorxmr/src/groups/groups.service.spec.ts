import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { Group } from './entities/group.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { PayoutOrderStrategy } from './entities/payout-order-strategy.enum';
import { WinstonLogger } from '../common/logger/winston.logger';

describe('GroupsService', () => {
  let service: GroupsService;
  let groupRepository: Repository<Group>;
  let membershipRepository: Repository<Membership>;

  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupsService,
        {
          provide: getRepositoryToken(Group),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Membership),
          useValue: {
            find: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: WinstonLogger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<GroupsService>(GroupsService);
    groupRepository = module.get<Repository<Group>>(getRepositoryToken(Group));
    membershipRepository = module.get<Repository<Membership>>(
      getRepositoryToken(Membership),
    );
  });

  describe('activateGroup', () => {
    it('should throw NotFoundException if group does not exist', async () => {
      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(null);

      await expect(service.activateGroup('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if group is already active', async () => {
      const group = {
        id: 'group-1',
        status: 'ACTIVE',
        payoutOrderStrategy: PayoutOrderStrategy.SEQUENTIAL,
      } as Group;

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);

      await expect(service.activateGroup('group-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if group has no members', async () => {
      const group = {
        id: 'group-1',
        status: 'PENDING',
        payoutOrderStrategy: PayoutOrderStrategy.SEQUENTIAL,
      } as Group;

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);
      jest.spyOn(membershipRepository, 'find').mockResolvedValue([]);

      await expect(service.activateGroup('group-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should activate group with SEQUENTIAL strategy without changes', async () => {
      const group = {
        id: 'group-1',
        status: 'PENDING',
        payoutOrderStrategy: PayoutOrderStrategy.SEQUENTIAL,
      } as Group;

      const members = [
        { id: 'm1', payoutOrder: 0 } as Membership,
        { id: 'm2', payoutOrder: 1 } as Membership,
        { id: 'm3', payoutOrder: 2 } as Membership,
      ];

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);
      jest.spyOn(membershipRepository, 'find').mockResolvedValue(members);
      jest.spyOn(groupRepository, 'save').mockResolvedValue({
        ...group,
        status: 'ACTIVE',
      });

      const result = await service.activateGroup('group-1');

      expect(result.status).toBe('ACTIVE');
      expect(membershipRepository.save).not.toHaveBeenCalled();
    });

    it('should randomize payout order with RANDOM strategy', async () => {
      const group = {
        id: 'group-1',
        status: 'PENDING',
        payoutOrderStrategy: PayoutOrderStrategy.RANDOM,
      } as Group;

      const members = [
        { id: 'm1', payoutOrder: null } as Membership,
        { id: 'm2', payoutOrder: null } as Membership,
        { id: 'm3', payoutOrder: null } as Membership,
      ];

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);
      jest.spyOn(membershipRepository, 'find').mockResolvedValue(members);
      jest
        .spyOn(membershipRepository, 'save')
        .mockImplementation((m) => Promise.resolve(m));
      jest.spyOn(groupRepository, 'save').mockResolvedValue({
        ...group,
        status: 'ACTIVE',
      });

      await service.activateGroup('group-1');

      // Verify that save was called for each member
      expect(membershipRepository.save).toHaveBeenCalledTimes(3);

      // Verify that all members have assigned payout orders
      const savedMembers = members.filter((m) => m.payoutOrder !== null);
      expect(savedMembers.length).toBe(3);
    });

    it('should validate ADMIN_DEFINED strategy with complete orders', async () => {
      const group = {
        id: 'group-1',
        status: 'PENDING',
        payoutOrderStrategy: PayoutOrderStrategy.ADMIN_DEFINED,
      } as Group;

      const members = [
        { id: 'm1', payoutOrder: 0 } as Membership,
        { id: 'm2', payoutOrder: 1 } as Membership,
        { id: 'm3', payoutOrder: 2 } as Membership,
      ];

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);
      jest.spyOn(membershipRepository, 'find').mockResolvedValue(members);
      jest.spyOn(groupRepository, 'save').mockResolvedValue({
        ...group,
        status: 'ACTIVE',
      });

      const result = await service.activateGroup('group-1');

      expect(result.status).toBe('ACTIVE');
    });

    it('should throw BadRequestException for ADMIN_DEFINED with null orders', async () => {
      const group = {
        id: 'group-1',
        status: 'PENDING',
        payoutOrderStrategy: PayoutOrderStrategy.ADMIN_DEFINED,
      } as Group;

      const members = [
        { id: 'm1', payoutOrder: 0 } as Membership,
        { id: 'm2', payoutOrder: null } as Membership,
        { id: 'm3', payoutOrder: 2 } as Membership,
      ];

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);
      jest.spyOn(membershipRepository, 'find').mockResolvedValue(members);

      await expect(service.activateGroup('group-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for ADMIN_DEFINED with missing positions', async () => {
      const group = {
        id: 'group-1',
        status: 'PENDING',
        payoutOrderStrategy: PayoutOrderStrategy.ADMIN_DEFINED,
      } as Group;

      const members = [
        { id: 'm1', payoutOrder: 0 } as Membership,
        { id: 'm2', payoutOrder: 1 } as Membership,
        { id: 'm3', payoutOrder: 5 } as Membership, // Gap in sequence
      ];

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);
      jest.spyOn(membershipRepository, 'find').mockResolvedValue(members);

      await expect(service.activateGroup('group-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for ADMIN_DEFINED with duplicate positions', async () => {
      const group = {
        id: 'group-1',
        status: 'PENDING',
        payoutOrderStrategy: PayoutOrderStrategy.ADMIN_DEFINED,
      } as Group;

      const members = [
        { id: 'm1', payoutOrder: 0 } as Membership,
        { id: 'm2', payoutOrder: 1 } as Membership,
        { id: 'm3', payoutOrder: 1 } as Membership, // Duplicate
      ];

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);
      jest.spyOn(membershipRepository, 'find').mockResolvedValue(members);

      await expect(service.activateGroup('group-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
