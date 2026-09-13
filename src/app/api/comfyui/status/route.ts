import { NextRequest, NextResponse } from 'next/server';
import { checkComfyStatus } from '@/lib/comfyui/client';
import { DEFAULT_COMFYUI_URL } from '@/lib/config';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url') || DEFAULT_COMFYUI_URL;
  const status = await checkComfyStatus(url);
  return NextResponse.json(status);
}
