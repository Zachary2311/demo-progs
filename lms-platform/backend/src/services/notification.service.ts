import fetch from 'node-fetch';
import prisma from '../config/database';
import logger from '../utils/logger';

const DISCORD_WEBHOOK_ENABLED = process.env.DISCORD_WEBHOOK_ENABLED === 'true';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

export class NotificationService {
  static async createNotification(
    userId: string,
    title: string,
    message: string,
    type: string,
    metadata?: object
  ) {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId,
          title,
          message,
          type,
          metadata: metadata ? JSON.stringify(metadata) : null,
        },
      });

      return notification;
    } catch (error) {
      logger.error('Failed to create notification:', error);
      throw error;
    }
  }

  static async sendDiscordWebhook(content: string, embeds?: any[]) {
    if (!DISCORD_WEBHOOK_ENABLED || !DISCORD_WEBHOOK_URL) {
      return;
    }

    try {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          embeds,
        }),
      });
    } catch (error) {
      logger.error('Failed to send Discord webhook:', error);
    }
  }

  static async notifyEnrollment(userId: string, courseTitle: string) {
    await this.createNotification(
      userId,
      'Course Enrollment',
      `You have been enrolled in ${courseTitle}`,
      'enrollment'
    );

    await this.sendDiscordWebhook(
      `🎓 New enrollment in **${courseTitle}**`
    );
  }

  static async notifyGradePosted(userId: string, courseName: string, grade: number) {
    await this.createNotification(
      userId,
      'Grade Posted',
      `Your grade for ${courseName} has been posted: ${grade}%`,
      'grade',
      { grade, courseName }
    );
  }

  static async notifyAssignmentDeadline(userId: string, assignmentTitle: string, dueDate: Date) {
    await this.createNotification(
      userId,
      'Assignment Deadline',
      `Assignment "${assignmentTitle}" is due on ${dueDate.toLocaleDateString()}`,
      'deadline',
      { assignmentTitle, dueDate }
    );
  }

  static async notifyAnnouncement(userId: string, courseTitle: string, announcement: string) {
    await this.createNotification(
      userId,
      `New Announcement in ${courseTitle}`,
      announcement,
      'announcement'
    );
  }
}
