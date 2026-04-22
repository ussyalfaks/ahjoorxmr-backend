/**
 * Integration test: Stale Group Full Flow
 *
 * Tests the complete lifecycle:
 *   ACTIVE group → detected as stale → status = STALE
 *   → contribution attempt rejected (409)
 *   → admin reactivates → status = ACTIVE
 *   → contribution accepted again
 *
 * Uses an in-memory SQLite database via TypeORM so no Postgres instance is needed.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Group } from '../../groups/entities/group.entity';
import { GroupStatus } from '../../groups/enums/group-status.enum';
import { Notification } from '../../notifications/entities/notification.entity';
import { NotificationType } from '../../notifications/enums/notification-type.enum';
import { Contribution } from '../../contributions/entities/contribution.entity';

import { GroupsService } from '../../groups/groups.service';
import { ContributionsService } from '../../contributions/contributions.service';
import { StaleGroupDetectionService } from '../../groups/stale-group-detection.service';
import { NotificationsService } from '../../notifications/notifications.service';

describe('Stale Group Full Flow (Integration)', () => {
  let module: TestingModule;

  let groupsService: GroupsService;
  let contributionsService: ContributionsService;
  let staleDetectionService: StaleGroupDetectionService;

  let groupRepository: Repository<Group>;
  let notificationRepository: Repository<Notification>;

  // ── Setup ─────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [Group, Notification, Contribution],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([Group, Notification, Contribution]),
      ],
      providers: [
        GroupsService,
        ContributionsService,
        StaleGroupDetectionService,
        NotificationsService,
      ],
    }).compile();

    groupsService = module.get(GroupsService);
    contributionsService = module.get(ContributionsService);
    staleDetectionService = module.get(StaleGroupDetectionService);

    groupRepository = module.get(getRepositoryToken(Group));
    notificationRepository = module.get(getRepositoryToken(Notification));
  });

  afterAll(async () => {
    await module.close();
  });

  afterEach(async () => {
    await notificationRepository.clear();
    await groupRepository.clear();
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  const createActiveGroup = async (
    overrides: Partial<Group> = {},
  ): Promise<Group> => {
    const group = groupRepository.create({
      id: 'group-test-uuid',
      name: 'Test Savings Group',
      adminId: 'admin-test-uuid',
      status: GroupStatus.ACTIVE,
      currentRound: 3,
      lastActiveAt: new Date('2023-01-01'), // old enough to be stale
      staleAt: null,
      ...overrides,
    });
    return groupRepository.save(group);
  };

  // ── Tests ─────────────────────────────────────────────────────────────────

  describe('Step 1: Group starts ACTIVE and accepts contributions', () => {
    it('should allow a contribution to an ACTIVE group', async () => {
      const group = await createActiveGroup({
        lastActiveAt: new Date(), // recent — not stale
      });

      const contribution = await contributionsService.create('user-1', {
        groupId: group.id,
        amount: 5000,
      });

      expect(contribution).toBeDefined();
      expect(contribution.groupId).toBe(group.id);
      expect(contribution.userId).toBe('user-1');
      expect(contribution.round).toBe(3);
    });
  });

  describe('Step 2: Stale detection marks group as STALE and notifies admin', () => {
    it('should transition group to STALE status', async () => {
      await createActiveGroup();

      await staleDetectionService.detectAndMarkStaleGroups();

      const updated = await groupRepository.findOne({
        where: { id: 'group-test-uuid' },
      });

      expect(updated!.status).toBe(GroupStatus.STALE);
      expect(updated!.staleAt).not.toBeNull();
    });

    it('should send a GROUP_STALE notification to the admin', async () => {
      await createActiveGroup();

      await staleDetectionService.detectAndMarkStaleGroups();

      const notification = await notificationRepository.findOne({
        where: {
          userId: 'admin-test-uuid',
          type: NotificationType.GROUP_STALE,
        },
      });

      expect(notification).not.toBeNull();
      expect(notification!.payload).toMatchObject({
        groupId: 'group-test-uuid',
        groupName: 'Test Savings Group',
        lastActiveRound: 3,
      });
    });

    it('should not affect groups that are recently active', async () => {
      await createActiveGroup({ lastActiveAt: new Date() }); // fresh

      await staleDetectionService.detectAndMarkStaleGroups();

      const group = await groupRepository.findOne({
        where: { id: 'group-test-uuid' },
      });

      expect(group!.status).toBe(GroupStatus.ACTIVE);
      expect(group!.staleAt).toBeNull();
    });
  });

  describe('Step 3: Contributions blocked on STALE group', () => {
    it('should throw 409 ConflictException for STALE group', async () => {
      await createActiveGroup();
      await staleDetectionService.detectAndMarkStaleGroups();

      await expect(
        contributionsService.create('user-1', {
          groupId: 'group-test-uuid',
          amount: 5000,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should include the group name in the 409 error message', async () => {
      await createActiveGroup();
      await staleDetectionService.detectAndMarkStaleGroups();

      await expect(
        contributionsService.create('user-1', {
          groupId: 'group-test-uuid',
          amount: 5000,
        }),
      ).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining('Test Savings Group'),
      });
    });
  });

  describe('Step 4: Admin reactivates the group', () => {
    it('should clear staleAt and reset status to ACTIVE', async () => {
      await createActiveGroup();
      await staleDetectionService.detectAndMarkStaleGroups();

      const reactivated = await groupsService.reactivate(
        'group-test-uuid',
        'platform-admin',
        'Members confirmed they will resume contributions',
      );

      expect(reactivated.status).toBe(GroupStatus.ACTIVE);
      expect(reactivated.staleAt).toBeNull();
    });

    it('should send a GROUP_REACTIVATED notification to the admin', async () => {
      await createActiveGroup();
      await staleDetectionService.detectAndMarkStaleGroups();

      const reason = 'Group confirmed resuming next cycle';

      await groupsService.reactivate(
        'group-test-uuid',
        'platform-admin',
        reason,
      );

      const notification = await notificationRepository.findOne({
        where: {
          userId: 'admin-test-uuid',
          type: NotificationType.GROUP_REACTIVATED,
        },
      });

      expect(notification).not.toBeNull();
      expect(notification!.payload).toMatchObject({
        groupId: 'group-test-uuid',
        groupName: 'Test Savings Group',
        reason,
      });
    });

    it('should reject reactivation of a non-STALE group', async () => {
      await createActiveGroup(); // status = ACTIVE, not STALE

      await expect(
        groupsService.reactivate(
          'group-test-uuid',
          'platform-admin',
          'Some reason provided',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Step 5: Contributions accepted again after reactivation', () => {
    it('should allow contributions after group is reactivated', async () => {
      await createActiveGroup();
      await staleDetectionService.detectAndMarkStaleGroups();
      await groupsService.reactivate(
        'group-test-uuid',
        'platform-admin',
        'Group is resuming contributions',
      );

      const contribution = await contributionsService.create('user-2', {
        groupId: 'group-test-uuid',
        amount: 3000,
      });

      expect(contribution).toBeDefined();
      expect(contribution.amount).toBe(3000);
      expect(contribution.userId).toBe('user-2');
    });
  });

  describe('Step 6: list() exposes staleAt and supports status filter', () => {
    it('should expose staleAt when listing groups', async () => {
      await createActiveGroup();
      await staleDetectionService.detectAndMarkStaleGroups();

      const result = await groupsService.list({ page: 1, limit: 20 });

      const staleGroup = result.data.find((g) => g.id === 'group-test-uuid');
      expect(staleGroup).toBeDefined();
      expect(staleGroup!.staleAt).not.toBeNull();
    });

    it('should filter groups by STALE status', async () => {
      await createActiveGroup();
      await staleDetectionService.detectAndMarkStaleGroups();

      const result = await groupsService.list({
        status: GroupStatus.STALE,
        page: 1,
        limit: 20,
      });

      expect(result.data.every((g) => g.status === GroupStatus.STALE)).toBe(
        true,
      );
      expect(result.total).toBeGreaterThan(0);
    });

    it('should not include STALE groups when filtering by ACTIVE', async () => {
      await createActiveGroup();
      await staleDetectionService.detectAndMarkStaleGroups();

      const result = await groupsService.list({
        status: GroupStatus.ACTIVE,
        page: 1,
        limit: 20,
      });

      expect(result.data.every((g) => g.status === GroupStatus.ACTIVE)).toBe(
        true,
      );
      expect(
        result.data.find((g) => g.id === 'group-test-uuid'),
      ).toBeUndefined();
    });
  });
});
