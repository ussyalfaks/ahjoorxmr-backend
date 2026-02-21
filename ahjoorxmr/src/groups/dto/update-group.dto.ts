import {
    IsString,
    IsNotEmpty,
    IsInt,
    IsOptional,
    Min,
    MinLength,
    Matches,
} from 'class-validator';

/**
 * DTO for updating an existing ROSCA group.
 * All fields are optional — only provided fields will be updated.
 * Status changes are handled internally by the service, not via this DTO.
 */
export class UpdateGroupDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    name?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    adminWallet?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @Matches(/^\d+(\.\d+)?$/, {
        message: 'contributionAmount must be a non-negative decimal number',
    })
    contributionAmount?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    token?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    roundDuration?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    totalRounds?: number;

    @IsOptional()
    @IsString()
    contractAddress?: string;
}
