import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { MailService, TEMPLATE_SAMPLE_DATA } from './mail.service';

@Controller('admin/mail/preview')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class MailPreviewController {
  constructor(private readonly mailService: MailService) {}

  @Get(':template')
  preview(
    @Param('template') template: string,
    @Query('lang') lang: string,
    @Res() res: Response,
  ): void {
    const context = TEMPLATE_SAMPLE_DATA[template] ?? {};
    const html = this.mailService.compileTemplate(template, context, lang);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }
}
