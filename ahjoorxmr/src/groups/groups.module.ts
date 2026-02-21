import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { Group } from './entities/group.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { WinstonLogger } from '../common/logger/winston.logger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/**
 * GroupsModule manages ROSCA group entities in the database.
 * It is the source of truth for group state as reflected by the REST API.
 * Smart contract interactions are handled by a separate Stellar service.
 */
@Module({
    imports: [TypeOrmModule.forFeature([Group, Membership])],
    controllers: [GroupsController],
    providers: [GroupsService, WinstonLogger, JwtAuthGuard],
    exports: [GroupsService],
})
export class GroupsModule { }
