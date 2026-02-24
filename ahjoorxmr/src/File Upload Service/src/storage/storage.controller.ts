import {
  Controller,
  Post,
  Get,
  Param,
  UseInterceptors,
  UploadedFile,
  Body,
  Query,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { StorageService } from "./storage.service";
import { UploadFileDto } from "./dto/upload-file.dto";

@Controller("api/v1/upload")
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post()
  @UseInterceptors(FileInterceptor("file"))
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({
            fileType: /(image\/jpeg|image\/png|image\/webp|application\/pdf)/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() uploadDto: UploadFileDto,
  ) {
    const userId = uploadDto.userId || "anonymous";
    const metadata = await this.storageService.uploadFile(
      file,
      uploadDto.fileType,
      userId,
    );

    return {
      id: metadata.id,
      filename: metadata.originalName,
      size: metadata.size,
      mimeType: metadata.mimeType,
      url: metadata.url,
      thumbnailUrl: metadata.thumbnailUrl,
      createdAt: metadata.createdAt,
    };
  }

  @Get(":id/signed-url")
  async getSignedUrl(
    @Param("id") id: string,
    @Query("expiresIn") expiresIn?: number,
  ) {
    const url = await this.storageService.getSignedUrl(
      id,
      expiresIn ? parseInt(expiresIn.toString()) : 3600,
    );
    return { url };
  }

  @Get(":id")
  async getFileMetadata(@Param("id") id: string) {
    return this.storageService.getFileMetadata(id);
  }
}
