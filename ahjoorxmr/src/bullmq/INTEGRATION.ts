// ─── main.ts integration snippet ────────────────────────────────────────────
//
// Add these lines to your bootstrap() function in main.ts after app creation:
//
//   import { BullBoardService } from './queue';
//
//   async function bootstrap() {
//     const app = await NestFactory.create(AppModule);
//
//     // Mount BullBoard (only in non-production — the service checks NODE_ENV)
//     const bullBoard = app.get(BullBoardService);
//     await bullBoard.mount(app);
//
//     await app.listen(3000);
//   }
//
// ─── AppModule integration ───────────────────────────────────────────────────
//
// In app.module.ts, add QueueModule to the imports array:
//
//   import { QueueModule } from './queue';
//
//   @Module({
//     imports: [
//       ConfigModule.forRoot({ isGlobal: true }),
//       RedisModule,          // your existing Redis module
//       QueueModule,          // ← add this
//       NotificationsModule,
//       // ...other modules
//     ],
//   })
//   export class AppModule {}
//
// ─── Using QueueService in other modules ────────────────────────────────────
//
// In any module that needs to enqueue jobs:
//
//   @Module({
//     imports: [QueueModule],     // imports QueueModule
//     providers: [NotificationService],
//   })
//   export class NotificationsModule {}
//
//   // In NotificationService:
//   constructor(private readonly queueService: QueueService) {}
//
//   async notifyUser(userId: string, email: string) {
//     await this.queueService.addSendNotificationEmail({
//       userId,
//       notificationType: 'GROUP_INVITE',
//       to: email,
//       subject: 'You have been invited',
//     });
//   }
//
// ─── Required packages ───────────────────────────────────────────────────────
//
//   npm install bullmq @nestjs/bullmq
//   npm install @bull-board/api @bull-board/express   # optional: for dashboard
//
// ─── Environment variables required ─────────────────────────────────────────
//
//   REDIS_HOST=localhost
//   REDIS_PORT=6379
//   REDIS_PASSWORD=          # optional
//   REDIS_TLS=false          # set to "true" for TLS
//   NODE_ENV=development     # BullBoard is disabled when set to "production"
