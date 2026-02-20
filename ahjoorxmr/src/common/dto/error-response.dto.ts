import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 400,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Error message or array of error messages',
    oneOf: [
      { type: 'string', example: 'Bad Request' },
      {
        type: 'array',
        items: { type: 'string' },
        example: ['field is required'],
      },
    ],
  })
  message: string | string[];

  @ApiProperty({
    description: 'Error type',
    example: 'Bad Request',
  })
  error: string;

  @ApiProperty({
    description: 'Request timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Request path',
    example: '/api/endpoint',
  })
  path: string;
}

export class ValidationErrorResponseDto {
  @ApiProperty({
    description: 'Validation error messages',
    type: [String],
    example: ['field must be a string', 'field should not be empty'],
  })
  message: string[];

  @ApiProperty({
    description: 'HTTP status code for validation errors',
    example: 400,
  })
  statusCode: 400;

  @ApiProperty({
    description: 'Error type for validation errors',
    example: 'Bad Request',
  })
  error: 'Bad Request';

  @ApiProperty({
    description: 'Request timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Request path',
    example: '/api/endpoint',
  })
  path: string;
}

export class NotFoundErrorResponseDto {
  @ApiProperty({
    description: 'Not found error message',
    example: 'Resource not found',
  })
  message: string;

  @ApiProperty({
    description: 'HTTP status code for not found errors',
    example: 404,
  })
  statusCode: 404;

  @ApiProperty({
    description: 'Error type for not found errors',
    example: 'Not Found',
  })
  error: 'Not Found';

  @ApiProperty({
    description: 'Request timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Request path',
    example: '/api/endpoint',
  })
  path: string;
}

export class InternalServerErrorResponseDto {
  @ApiProperty({
    description: 'Internal server error message',
    example: 'Internal server error',
  })
  message: string;

  @ApiProperty({
    description: 'HTTP status code for internal server errors',
    example: 500,
  })
  statusCode: 500;

  @ApiProperty({
    description: 'Error type for internal server errors',
    example: 'Internal Server Error',
  })
  error: 'Internal Server Error';

  @ApiProperty({
    description: 'Request timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Request path',
    example: '/api/endpoint',
  })
  path: string;
}
