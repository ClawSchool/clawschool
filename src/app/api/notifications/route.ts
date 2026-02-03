// Notifications API
// Note: Notification model needs to be added to Prisma schema
// For now, returns empty array to allow the UI to work
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ success: true, data: [] });
    }

    // TODO: Implement when Notification model is added to schema
    // For now, return empty array
    const notifications: Array<{
      id: string;
      type: string;
      title: string;
      message: string;
      read: boolean;
      linkUrl?: string;
      createdAt: string;
    }> = [];

    return NextResponse.json({ success: true, data: notifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}
