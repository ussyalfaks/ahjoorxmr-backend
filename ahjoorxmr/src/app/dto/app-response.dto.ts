import { ApiProperty } from '@nestjs/swagger';

export class HelloResponseDto {
  @ApiProperty({
    description: 'Welcome message from the API',
    example: 'Hello World!',
  })
  message: string;
}
