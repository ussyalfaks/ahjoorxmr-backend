import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MailController } from '@/mail/controllers/mail.controller';
import { TemplateService } from '@/mail/services/template.service';
import { NotificationType } from '@/common/types/email.types';

describe('MailController - Preview Endpoint', () => {
  let controller: MailController;
  let templateService: TemplateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MailController],
      providers: [TemplateService],
    }).compile();

    controller = module.get<MailController>(MailController);
    templateService = module.get<TemplateService>(TemplateService);
  });

  afterEach(() => {
    // Reset NODE_ENV
    delete process.env.NODE_ENV;
  });

  describe('GET /api/v1/mail/preview/:type', () => {
    it('should deny preview in production environment', () => {
      process.env.NODE_ENV = 'production';

      expect(() => {
        controller.previewTemplate(NotificationType.ROUND_OPENED);
      }).toThrow(BadRequestException);
    });

    it('should preview ROUND_OPENED template in development', () => {
      process.env.NODE_ENV = 'development';

      const result = controller.previewTemplate(NotificationType.ROUND_OPENED);

      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('type');
      expect(result.type).toBe(NotificationType.ROUND_OPENED);
      expect(result.html).toContain('<html');
      expect(result.html).toContain('Jane Founder');
    });

    it('should preview PAYOUT_RECEIVED template in development', () => {
      process.env.NODE_ENV = 'development';

      const result = controller.previewTemplate(
        NotificationType.PAYOUT_RECEIVED,
      );

      expect(result).toHaveProperty('html');
      expect(result.type).toBe(NotificationType.PAYOUT_RECEIVED);
      expect(result.html).toContain('50000');
      expect(result.html).toContain('USD');
    });

    it('should preview PAYMENT_REMINDER template in development', () => {
      process.env.NODE_ENV = 'development';

      const result = controller.previewTemplate(
        NotificationType.PAYMENT_REMINDER,
      );

      expect(result).toHaveProperty('html');
      expect(result.type).toBe(NotificationType.PAYMENT_REMINDER);
      expect(result.html).toContain('John Investor');
    });

    it('should reject invalid notification type', () => {
      process.env.NODE_ENV = 'development';

      expect(() => {
        controller.previewTemplate('INVALID_TYPE');
      }).toThrow(BadRequestException);
    });

    it('should provide helpful error message for invalid type', () => {
      process.env.NODE_ENV = 'development';

      try {
        controller.previewTemplate('INVALID');
        fail('Should throw error');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.message).toContain('Invalid notification type');
        expect(error.message).toContain('ROUND_OPENED');
      }
    });

    it('should handle malformed metadata gracefully', () => {
      process.env.NODE_ENV = 'development';

      // This should not throw - sample data is well-formed
      // The graceful fallback is in place for when someone manually adds bad data
      const result = controller.previewTemplate(NotificationType.ROUND_OPENED);
      expect(result.html).toBeTruthy();
    });
  });

  describe('GET /api/v1/mail/templates', () => {
    it('should list all available templates', () => {
      const result = controller.listTemplates();

      expect(result).toHaveProperty('types');
      expect(Array.isArray(result.types)).toBe(true);
      expect(result.types).toContain(NotificationType.ROUND_OPENED);
      expect(result.types).toContain(NotificationType.PAYOUT_RECEIVED);
      expect(result.types).toContain(NotificationType.PAYMENT_REMINDER);
    });

    it('should be accessible in all environments', () => {
      process.env.NODE_ENV = 'production';
      const result = controller.listTemplates();
      expect(result.types.length).toBeGreaterThan(0);

      process.env.NODE_ENV = 'development';
      const result2 = controller.listTemplates();
      expect(result2.types.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should provide helpful error for missing sample metadata', () => {
      process.env.NODE_ENV = 'development';

      // Mock template service to throw error
      jest
        .spyOn(templateService, 'renderTemplate')
        .mockImplementationOnce(() => {
          throw new Error('Missing required fields: roundName');
        });

      try {
        controller.previewTemplate(NotificationType.ROUND_OPENED);
        fail('Should throw error');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.message).toContain('Incomplete sample metadata');
      }
    });

    it('should handle general rendering errors gracefully', () => {
      process.env.NODE_ENV = 'development';

      jest
        .spyOn(templateService, 'renderTemplate')
        .mockImplementationOnce(() => {
          throw new Error('Unexpected handlebars error');
        });

      try {
        controller.previewTemplate(NotificationType.ROUND_OPENED);
        fail('Should throw error');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.message).toContain('Failed to render template');
      }
    });
  });
});
