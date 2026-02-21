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
 * DTO for creating a new ROSCA group.
 * All fields are required except contractAddress which is assigned after on-chain deployment.
 */
export class CreateGroupDto {
    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    name: string;

    @IsString()
    @IsNotEmpty()
    adminWallet: string;

    /**
     * Contribution amount stored as a string to avoid floating-point precision loss.
     * Must be a non-negative decimal number (e.g. "100", "0.5").
     */
    @IsString()
    @IsNotEmpty()
    @Matches(/^\d+(\.\d+)?$/, {
        message: 'contributionAmount must be a non-negative decimal number',
    })
    contributionAmount: string;

    /** Token contract address (e.g. Stellar asset identifier) */
    @IsString()
    @IsNotEmpty()
    token: string;

    /** Duration of each round in seconds */
    @IsInt()
    @Min(1)
    roundDuration: number;

    @IsInt()
    @Min(1)
    totalRounds: number;

    /** On-chain contract address — optional at creation time */
    @IsOptional()
    @IsString()
    contractAddress?: string;
}
