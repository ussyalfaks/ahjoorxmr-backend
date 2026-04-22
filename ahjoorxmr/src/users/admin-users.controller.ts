import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  Version,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

@ApiTags('Admin Users')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  @Version('1')
  @Roles('admin')
  @ApiOperation({
    summary: 'Get full user profile (Admin only)',
    description: 'Returns the full user entity including internal fields. Restricted to administrators.',
  })
  @ApiResponse({
    status: 200,
    description: 'Full user profile retrieved successfully',
    type: User,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin role required',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async findOne(@Param('id') id: string): Promise<User> {
    return this.usersService.findById(id);
  }

  @Post(':id/ban')
  @Version('1')
  @Roles('admin')
  @ApiOperation({
    summary: 'Ban user (Admin only)',
    description:
      'Bans the user and revokes all JWT sessions by incrementing tokenVersion.',
  })
  @ApiResponse({ status: 200, description: 'User banned', type: User })
  async ban(
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ): Promise<User> {
    return this.usersService.banUser(id, body?.reason);
  }
}
