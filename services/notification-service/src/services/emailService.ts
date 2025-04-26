import axios from 'axios';
import * as fs from 'fs';
import nodemailer, { Transporter } from 'nodemailer';
import * as path from 'path';
import { EmailContent, NotificationType } from '../models/notification';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

interface EmailResult {
  success: boolean;
  messageId: string | null;
}

interface UserData {
  email?: string;
  name?: string;
  username?: string;
}

class EmailService {
  private readonly transporter: Transporter;
  private readonly senderEmail: string;
  private readonly usersServiceUrl: string;
  private readonly notificationsServiceUrl: string;
  private readonly templateCache: Map<string, string> = new Map();
  private emailStyles: string | null = null;

  constructor() {
    const requiredEnvVars = [
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USER',
      'SMTP_PASS',
      'SENDER_EMAIL',
      'USERS_SERVICE_URL',
      'NOTIFICATIONS_SERVICE_URL',
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }

    const emailConfig: EmailConfig = {
      host: process.env.SMTP_HOST!,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
      },
    };

    this.transporter = nodemailer.createTransport(emailConfig);
    this.senderEmail = process.env.SENDER_EMAIL!;
    this.usersServiceUrl = process.env.USERS_SERVICE_URL!;
    this.notificationsServiceUrl = process.env.NOTIFICATIONS_SERVICE_URL!;
  }

  private async loadTemplate(templateName: string): Promise<string> {
    const cached = this.templateCache.get(templateName);
    if (cached) return cached;

    const templatePath = path.join(__dirname, '..', 'templates', `${templateName}.html`);
    const template = await fs.promises.readFile(templatePath, 'utf8');
    this.templateCache.set(templateName, template);
    return template;
  }

  private async loadStyles(): Promise<string> {
    if (this.emailStyles) return this.emailStyles;

    const stylePath = path.join(__dirname, '..', 'styles', 'email.css');
    this.emailStyles = await fs.promises.readFile(stylePath, 'utf8');
    return this.emailStyles;
  }

  private async formatEmailContent(
    type: NotificationType,
    content: EmailContent,
    userName: string,
    emailId: string
  ): Promise<string> {
    const trackingUrl = `${this.notificationsServiceUrl}/track-email/${emailId}`;
    const styles = await this.loadStyles();
    const currentYear = new Date().getFullYear();
    const platformUrl = process.env.PLATFORM_URL || '#';

    const templateMapping: Record<NotificationType, string> = {
      [NotificationType.USER_UPDATE]: 'userUpdate',
      [NotificationType.ORDER_UPDATE]: 'orderUpdate',
      [NotificationType.PROMOTION]: 'promotion',
      [NotificationType.EMAIL]: 'generic',
      [NotificationType.RECOMMENDATION]: 'generic', // Using generic template for recommendations
    };

    const templateName = templateMapping[type] || 'generic';
    let template = await this.loadTemplate(templateName);

    // Replace template variables
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    const replacements = {
      '{{styles}}': `<style>${styles}</style>`,
      '{{userName}}': userName,
      '{{content}}': contentStr,
      '{{currentYear}}': currentYear.toString(),
      '{{trackingUrl}}': trackingUrl,
      '{{platformUrl}}': platformUrl,
    };

    for (const [key, value] of Object.entries(replacements)) {
      template = template.replace(new RegExp(key, 'g'), value);
    }

    return template;
  }

  private async getUserData(userId: string): Promise<UserData> {
    try {
      const response = await axios.get(`${this.usersServiceUrl}/${userId}`, {
        timeout: 5000,
      });
      return response.data?.result || response.data;
    } catch (error) {
      console.error(`Failed to fetch user data for ID ${userId}:`, error);
      throw new Error('Failed to fetch user data');
    }
  }

  public async sendEmail(
    userId: string,
    subject: string,
    type: NotificationType,
    content: EmailContent
  ): Promise<EmailResult | null> {
    console.log('Preparing to send email', { userId, subject, type });

    try {
      const userData = await this.getUserData(userId);
      // const userEmail = userData?.email;
      const userEmail = 'temphawk7@gmail.com'; // Keeping the test email as per original code
      const userName = userData?.name || userData?.username || 'Valued Customer';

      if (!userEmail) {
        console.warn(`No email found for user ${userId}`);
        return null;
      }

      const htmlContent = await this.formatEmailContent(type, content, userName, userId);

      const mailOptions = {
        from: this.senderEmail,
        to: userEmail,
        subject,
        text: JSON.stringify(content),
        html: htmlContent,
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`Personalized email sent to ${userEmail}. Message ID: ${info.messageId}`);

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      console.error(`Email sending failed for user ${userId}:`, error);
      throw new Error('Comprehensive email notification failed');
    }
  }
}

// Export a singleton instance
export const emailService = new EmailService();

// Export the sendEmail method to maintain backward compatibility
export const sendEmail = (
  userId: string,
  subject: string,
  type: NotificationType,
  content: EmailContent
): Promise<EmailResult | null> => emailService.sendEmail(userId, subject, type, content);
