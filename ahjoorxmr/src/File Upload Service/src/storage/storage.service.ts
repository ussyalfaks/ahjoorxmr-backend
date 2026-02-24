import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as sharp from 'sharp';
import * as crypto from 'crypto';
import * as path from 'path';
import { FileMetadata } from './entities/file-metadata.entity';
import { FileType } from './dto/upload-file.dto';

@Injectable()
export class StorageService {
  private s3Client: S3Client;
  private bucket: string;
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  private readonly ALLOWED_DOCUMENT_TYPES = ['application/pdf'];
  private readonly THUMBNAIL_SIZE = 200;

  constructor(
    @InjectRepository(FileMetadata)
    private fileMetadataRepo: Repository<FileMetadata>,
    private configService: ConfigService,
  ) {
    this.bucket = this.configService.get('AWS_S3_BUCKET');
    this.s3Client = new S3Client({
      region: this.configService.get('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  async uploadFile(
    file: Express.Multer.File,
    fileType: FileType,
    userId: string,
  ): Promise<FileMetadata> {
    this.validateFile(file, fileType);

    const storageKey = this.generateStorageKey(file.originalname);
    const url = await this.uploadToS3(file.buffer, storageKey, file.mimetype);

    let thumbnailUrl: string | null = null;
    if (this.isImage(file.mimetype) && fileType === FileType.PROFILE_PICTURE) {
      thumbnailUrl = await this.generateThumbnail(file.buffer, storageKey);
    }

    const metadata = this.fileMetadataRepo.create({
      filename: storageKey,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url,
      thumbnailUrl,
      storageKey,
      uploadedBy: userId,
    });

    return this.fileMetadataRepo.save(metadata);
  }

  private validateFile(file: Express.Multer.File, fileType: FileType): void {
    if (file.size > this.MAX_FILE_SIZE) {
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    const allowedTypes = fileType === FileType.DOCUMENT
      ? this.ALLOWED_DOCUMENT_TYPES
      : this.ALLOWED_IMAGE_TYPES;

    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed: ${allowedTypes.join(', ')}`,
      );
    }

    // Basic magic number validation
    this.validateMagicNumbers(file.buffer, file.mimetype);
  }

  private validateMagicNumbers(buffer: Buffer, mimeType: string): void {
    const magicNumbers = {
      'image/jpeg': [0xff, 0xd8, 0xff],
      'image/png': [0x89, 0x50, 0x4e, 0x47],
      'application/pdf': [0x25, 0x50, 0x44, 0x46],
    };

    const expected = magicNumbers[mimeType];
    if (expected) {
      const actual = Array.from(buffer.slice(0, expected.length));
      if (!expected.every((byte, i) => byte === actual[i])) {
        throw new BadRequestException('File content does not match declared type');
      }
    }
  }

  private generateStorageKey(originalName: string): string {
    const hash = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(originalName);
    return `${Date.now()}-${hash}${ext}`;
  }

  private async uploadToS3(
    buffer: Buffer,
    key: string,
    contentType: string,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await this.s3Client.send(command);
    return `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }

  private async generateThumbnail(
    buffer: Buffer,
    originalKey: string,
  ): Promise<string> {
    const thumbnailBuffer = await sharp(buffer)
      .resize(this.THUMBNAIL_SIZE, this.THUMBNAIL_SIZE, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    const thumbnailKey = `thumbnails/${originalKey}`;
    return this.uploadToS3(thumbnailBuffer, thumbnailKey, 'image/jpeg');
  }

  private isImage(mimeType: string): boolean {
    return this.ALLOWED_IMAGE_TYPES.includes(mimeType);
  }

  async getSignedUrl(fileId: string, expiresIn: number = 3600): Promise<string> {
    const metadata = await this.fileMetadataRepo.findOne({ where: { id: fileId } });
    if (!metadata) {
      throw new BadRequestException('File not found');
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: metadata.storageKey,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async getFileMetadata(fileId: string): Promise<FileMetadata> {
    const metadata = await this.fileMetadataRepo.findOne({ where: { id: fileId } });
    if (!metadata) {
      throw new BadRequestException('File not found');
    }
    return metadata;
  }
}
