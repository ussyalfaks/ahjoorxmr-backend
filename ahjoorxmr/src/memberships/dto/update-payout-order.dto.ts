import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePayoutOrderDto {
  @ApiProperty({
    description: 'Payout order position (0-indexed)',
    example: 0,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  payoutOrder: number;
}
