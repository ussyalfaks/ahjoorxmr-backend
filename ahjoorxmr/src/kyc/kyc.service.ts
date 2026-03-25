import {
  Injectable,
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import {
  S3Client,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { KycDocument } from './entities/kyc-document.entity';
import { KycStatus } from './entities/kyc-status.enum';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notification/notifications.service';
import { NotificationType } from '../notification/notification-type.enum';
import { WinstonLogger } from '../common/logger/winston.logger';

const KYC_MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const KYC_ALLOWED_MIME = ['image/jpeg', 'image/png', 'application/pdf'];

@Injectable()
export class KycService {
  private readonly s3Client: S3Client | null;
  private readonly bucket: string | null;
  private readonly useS3: boolean;
  private readonly uploadDir: string;
  private readonly baseUrl: string;

  constructor(
    @InjectRepository(KycDocument)
    private readonly kycDocumentRepository: Repository<KycDocument>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
    private readonly logger: WinstonLogger,
  ) {
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET') ?? null;
    this.useS3 = !!this.bucket;
    this.uploadDir = this.configService.get<string>('LOCAL_STORAGE_PATH', './uploads');
    this.baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3000');

    if (this.useS3) {
      this.s3Client = new S3Client({
        region: this.configService.get<string>('AWS_REGION'),
        credentials: {
          accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID'),
          secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
        },
      });
    }
  }

  async uploadDocument(
    userId: string,
    file: Express.Multer.File,
  ): Promise<KycDocument> {
    this.validateFile(file);

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const ext = path.extname(file.originalname).toLowerCase();
    const storageKey = `kyc/${userId}/${crypto.randomUUID()}${ext}`;

    const url = this.useS3
      ? await this.uploadToS3(storageKey, file)
      : await this.uploadToLocal(storageKey, file);

    const doc = this.kycDocumentRepository.create({
      userId,
      storageKey,
      url,
      mimeType: file.mimetype,
      fileSize: file.size,
      originalName: file.originalname,
      uploadedAt: new Date(),
    });

    const saved = await this.kycDocumentRepository.save(doc);

    await this.userRepository.update(userId, { kycStatus: KycStatus.PENDING });

    await this.notificationsService.notify({
      userId,
      type: NotificationType.KYC_SUBMITTED,
      title: 'KYC Document Submitted',
      body: 'Your KYC document has been submitted and is pending review.',
    });

    this.logger.log(`KYC document uploaded for user ${userId}: ${storageKey}`, 'KycService');

    return saved;
  }

  async getLatestDocument(userId: string): Promise<KycDocument & { kycStatus: KycStatus }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const doc = await this.kycDocumentRepository.findOne({
      where: { userId },
      order: { uploadedAt: 'DESC' },
    });

    if (!doc) {
      throw new NotFoundException('No KYC document found');
    }

    return { ...doc, kycStatus: user.kycStatus };
  }

  private validateFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (file.size > KYC_MAX_SIZE) {
      throw new PayloadTooLargeException(
        `File exceeds the 5 MB limit (received ${file.size} bytes)`,
      );
    }

    if (!KYC_ALLOWED_MIME.includes(file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        `Unsupported file type: ${file.mimetype}. Allowed: ${KYC_ALLOWED_MIME.join(', ')}`,
      );
    }
  }

  private async uploadToS3(key: string, file: Express.Multer.File): Promise<string> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );
    return `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }

  private async uploadToLocal(key: string, file: Express.Multer.File): Promise<string> {
    const filePath = path.join(this.uploadDir, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, file.buffer);
    return `${this.baseUrl}/uploads/${key}`;
  }
}
