import { ApiProperty } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/base.dto';

export class UserDto {
  @ApiProperty({
    description: 'User unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'User full name',
    example: 'John Doe',
  })
  name: string;

  @ApiProperty({
    description: 'User role',
    example: 'user',
    enum: ['admin', 'user', 'moderator'],
  })
  role: string;

  @ApiProperty({
    description: 'Account creation timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  updatedAt: string;
}

export class PaginatedUsersResponseDto {
  @ApiProperty({
    description: 'Array of users',
    type: [UserDto],
  })
  data: UserDto[];

  @ApiProperty({
    description: 'Total number of users',
    example: 100,
  })
  total: number;

  @ApiProperty({
    description: 'Current page number',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Number of items per page',
    example: 10,
  })
  limit: number;

  @ApiProperty({
    description: 'Total number of pages',
    example: 10,
  })
  totalPages: number;
}

export class GetUsersQueryDto extends PaginationDto {
  @ApiProperty({
    description: 'Filter users by role',
    enum: ['admin', 'user', 'moderator'],
    required: false,
    example: 'user',
  })
  role?: string;
}
