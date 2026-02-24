import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { StorageService } from "./storage.service";
import { StorageController } from "./storage.controller";
import { FileMetadata } from "./entities/file-metadata.entity";

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([FileMetadata])],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
