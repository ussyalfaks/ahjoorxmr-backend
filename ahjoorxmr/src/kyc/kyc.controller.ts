import {
  Controller,
  Post,
  Get,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Version,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../notification/current-user.decorator';
import { KycService } from './kyc.service';
import { KycDocumentResponseDto } from './dto/kyc-document-response.dto';

@ApiTags('KYC')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('users/me/kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post()
  @Version('1')
  @UseInterceptors(FileInterceptor('document', { storage: memoryStorage() }))
  @ApiOperation({ summary: 'Upload KYC document' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        document: { type: 'string', format: 'binary' },
      },
      required: ['document'],
    },
  })
  @ApiResponse({ status: 201, type: KycDocumentResponseDto })
  @ApiResponse({ status: 413, description: 'File exceeds 5 MB limit' })
  @ApiResponse({ status: 415, description: 'Unsupported file type' })
  async uploadDocument(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<KycDocumentResponseDto> {
    const doc = await this.kycService.uploadDocument(userId, file);
    return {
      id: doc.id,
      storageKey: doc.storageKey,
      url: doc.url,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      originalName: doc.originalName,
      uploadedAt: doc.uploadedAt.toISOString(),
      kycStatus: (doc as any).kycStatus,
    };
  }

  @Get()
  @Version('1')
  @ApiOperation({ summary: 'Get latest KYC document' })
  @ApiResponse({ status: 200, type: KycDocumentResponseDto })
  @ApiResponse({ status: 404, description: 'No KYC document found' })
  async getDocument(
    @CurrentUser('id') userId: string,
  ): Promise<KycDocumentResponseDto> {
    const doc = await this.kycService.getLatestDocument(userId);
    return {
      id: doc.id,
      storageKey: doc.storageKey,
      url: doc.url,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      originalName: doc.originalName,
      uploadedAt: doc.uploadedAt.toISOString(),
      kycStatus: doc.kycStatus,
    };
  }
}
