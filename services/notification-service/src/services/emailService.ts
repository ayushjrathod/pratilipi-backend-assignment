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

interface TemplateContext {
  styles: string;
  userName: string;
  content: string | object;
  currentYear: string;
  trackingUrl: string;
  platformUrl: string;
  title: string;
  isPreformatted: boolean;
}

interface RecommendationItem {
  name?: string;
  category?: string;
  price?: number;
  description?: string;
}

interface RecommendationContent {
  itemCount?: number;
  recommendations?: RecommendationItem[];
}

interface UserData {
  email?: string;
  name?: string;
  username?: string;
}

interface ContentObject {
  message?: string;
  description?: string;
  text?: string;
  body?: string;
  content?: string;
  timestamp?: string;
  loginMethod?: string;
  orderId?: string;
  status?: string;
  trackingNumber?: string;
  estimatedDelivery?: string;
  subject?: string;
  name?: string;
  offer?: string;
  discount?: number;
  id?: string;
  userId?: string;
  emailId?: string;
  [key: string]: unknown;
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
      [NotificationType.RECOMMENDATION]: 'recommendation',
    };

    const templateName = templateMapping[type] || 'generic';
    let template = await this.loadTemplate(templateName);

    // Process content based on type and structure
    let processedContent: string | object;
    if (typeof content === 'string') {
      processedContent = content;
    } else if (typeof content === 'object' && content !== null) {
      processedContent = this.processObjectContent(type, content);
    } else {
      processedContent = String(content);
    }

    const templateContext = {
      styles: `<style>${styles}</style>`,
      userName,
      content: processedContent,
      currentYear: currentYear.toString(),
      trackingUrl,
      platformUrl,
      title: this.getTemplateTitle(type),
      isPreformatted:
        typeof processedContent === 'string' && this.shouldPreformat(processedContent),
    };

    // Use a more sophisticated template replacement that handles nested objects
    template = this.replaceTemplateVariables(template, templateContext);

    return template;
  }

  private getTemplateTitle(type: NotificationType): string {
    const titleMapping: Record<NotificationType, string> = {
      [NotificationType.USER_UPDATE]: 'Welcome Aboard!',
      [NotificationType.ORDER_UPDATE]: 'Order Update',
      [NotificationType.PROMOTION]: 'Exclusive Offer Curated Just for You!',
      [NotificationType.EMAIL]: 'Notification from Our Service',
      [NotificationType.RECOMMENDATION]: 'Your Personalized Product Recommendations',
    };
    return titleMapping[type] || 'Notification';
  }

  private shouldPreformat(content: string): boolean {
    // Check if content appears to be structured data that should be preformatted
    return content.includes('\n') && (content.includes('{') || content.includes('['));
  }

  private replaceTemplateVariables(template: string, context: TemplateContext): string {
    // Handle simple variable replacements
    let result = template;

    // Replace simple variables
    result = result.replace(/\{\{styles\}\}/g, context.styles);
    result = result.replace(/\{\{userName\}\}/g, context.userName || '');
    result = result.replace(/\{\{currentYear\}\}/g, context.currentYear);
    result = result.replace(/\{\{trackingUrl\}\}/g, context.trackingUrl);
    result = result.replace(/\{\{platformUrl\}\}/g, context.platformUrl);
    result = result.replace(/\{\{title\}\}/g, context.title);

    // Handle content rendering based on structure
    if (typeof context.content === 'string') {
      result = result.replace(/\{\{\{content\}\}\}/g, context.content);
    } else if (typeof context.content === 'object' && context.content !== null) {
      // Handle object content for recommendations and other structured data
      result = this.handleObjectContent(result, context.content);
    }

    // Handle conditional blocks
    result = this.handleConditionals(result, context);

    return result;
  }

  private handleObjectContent(template: string, content: RecommendationContent | object): string {
    let result = template;

    // Handle recommendations specifically
    if ('recommendations' in content && Array.isArray(content.recommendations)) {
      // Replace itemCount
      if ('itemCount' in content && content.itemCount) {
        result = result.replace(/\{\{content\.itemCount\}\}/g, content.itemCount.toString());
      }

      // Handle recommendations loop
      const recommendationsRegex =
        /\{\{#each content\.recommendations\}\}([\s\S]*?)\{\{\/each\}\}/g;
      result = result.replace(recommendationsRegex, (match, itemTemplate) => {
        return (content.recommendations || [])
          .map((rec: RecommendationItem) => {
            let itemHtml = itemTemplate;
            itemHtml = itemHtml.replace(/\{\{this\.name\}\}/g, rec.name || '');
            itemHtml = itemHtml.replace(/\{\{this\.category\}\}/g, rec.category || '');
            itemHtml = itemHtml.replace(/\{\{this\.price\}\}/g, rec.price || '');
            itemHtml = itemHtml.replace(/\{\{this\.description\}\}/g, rec.description || '');
            return itemHtml;
          })
          .join('');
      });
    } else {
      // For other object types, render as formatted JSON or string
      const contentStr = JSON.stringify(content, null, 2);
      result = result.replace(/\{\{\{content\}\}\}/g, contentStr);
    }

    return result;
  }

  private handleConditionals(template: string, context: TemplateContext): string {
    let result = template;

    // Handle {{#if content}} blocks
    const contentIfRegex = /\{\{#if content\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
    result = result.replace(contentIfRegex, (match, ifBlock, elseBlock) => {
      return context.content ? ifBlock : elseBlock;
    });

    // Handle {{#if content}} without else
    const contentIfOnlyRegex = /\{\{#if content\}\}([\s\S]*?)\{\{\/if\}\}/g;
    result = result.replace(contentIfOnlyRegex, (match, ifBlock) => {
      return context.content ? ifBlock : '';
    });

    // Handle {{#if content.itemCount}}
    const itemCountIfRegex =
      /\{\{#if content\.itemCount\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
    result = result.replace(itemCountIfRegex, (match, ifBlock, elseBlock) => {
      return context.content &&
        typeof context.content === 'object' &&
        'itemCount' in context.content
        ? ifBlock
        : elseBlock;
    });

    // Handle {{#if content.recommendations}}
    const recommendationsIfRegex =
      /\{\{#if content\.recommendations\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
    result = result.replace(recommendationsIfRegex, (match, ifBlock, elseBlock) => {
      return context.content &&
        typeof context.content === 'object' &&
        'recommendations' in context.content &&
        Array.isArray(context.content.recommendations) &&
        context.content.recommendations.length > 0
        ? ifBlock
        : elseBlock;
    });

    // Handle {{#if trackingUrl}}
    const trackingIfRegex = /\{\{#if trackingUrl\}\}([\s\S]*?)\{\{\/if\}\}/g;
    result = result.replace(trackingIfRegex, (match, ifBlock) => {
      return context.trackingUrl ? ifBlock : '';
    });

    // Handle {{#if isPreformatted}}
    const preformattedIfRegex =
      /\{\{#if isPreformatted\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
    result = result.replace(preformattedIfRegex, (match, ifBlock, elseBlock) => {
      return context.isPreformatted ? ifBlock : elseBlock;
    });

    return result;
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

  private processObjectContent(type: NotificationType, content: ContentObject): string | object {
    // Handle different object structures based on notification type
    switch (type) {
      case NotificationType.USER_UPDATE:
        return this.processUserUpdateContent(content);

      case NotificationType.ORDER_UPDATE:
        return this.processOrderUpdateContent(content);

      case NotificationType.PROMOTION:
        return this.processPromotionContent(content);

      case NotificationType.RECOMMENDATION:
        // Keep recommendations as objects for template processing
        if ('recommendations' in content && Array.isArray(content.recommendations)) {
          return content;
        }
        return this.extractMessageFromObject(content);

      case NotificationType.EMAIL:
      default:
        return this.extractMessageFromObject(content);
    }
  }

  private processUserUpdateContent(content: ContentObject): string {
    // For user updates, extract relevant information and format nicely
    if (content.message) {
      return content.message;
    }

    if (content.loginMethod) {
      return `Welcome! Your account has been successfully set up with ${content.loginMethod} authentication.`;
    }

    if (content.timestamp) {
      const date = new Date(content.timestamp);
      return `Your account was created on ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}.`;
    }

    return this.extractMessageFromObject(content);
  }

  private processOrderUpdateContent(content: ContentObject): string {
    // For order updates, extract order information
    if (content.message) {
      return content.message;
    }

    if (content.orderId) {
      let message = `Order #${content.orderId}`;
      if (content.status) {
        message += ` - Status: ${content.status}`;
      }
      if (content.trackingNumber) {
        message += `\nTracking Number: ${content.trackingNumber}`;
      }
      if (content.estimatedDelivery) {
        message += `\nEstimated Delivery: ${content.estimatedDelivery}`;
      }
      return message;
    }

    return this.extractMessageFromObject(content);
  }

  private processPromotionContent(content: ContentObject): string {
    // For promotions, extract the promotional message
    if (content.message) {
      return content.message;
    }

    if (content.subject && content.name) {
      // Extract the actual promotional content from subject
      const promoMatch = content.subject.match(/Promotion: (.+)/);
      if (promoMatch) {
        return promoMatch[1].replace(`, ${content.name}!`, '');
      }
    }

    if (content.offer) {
      return content.offer;
    }

    if (content.discount) {
      return `Special ${content.discount}% discount available now!`;
    }

    return this.extractMessageFromObject(content);
  }

  private extractMessageFromObject(content: ContentObject): string {
    // Try to extract a meaningful message from various object structures
    if (content.message) return content.message;
    if (content.description) return content.description;
    if (content.text) return content.text;
    if (content.body) return content.body;
    if (content.content) return content.content;

    // If no meaningful message found, format the object nicely
    const filteredContent = { ...content };
    // Remove common metadata fields that aren't user-friendly
    delete filteredContent.timestamp;
    delete filteredContent.id;
    delete filteredContent.userId;
    delete filteredContent.emailId;
    delete filteredContent.name; // Usually the user's name, not content

    // If there's still meaningful content, format it
    if (Object.keys(filteredContent).length > 0) {
      return Object.entries(filteredContent)
        .map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`)
        .join('\n');
    }

    // Last resort: return original content as JSON string
    return JSON.stringify(content, null, 2);
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
