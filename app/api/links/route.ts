import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createClient } from '@/lib/supabase/server';
import { auth } from '@clerk/nextjs/server';

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const { userId, orgId } = auth();
    const { logo, redirectUrl, internal_warehouse, } = await request.json();

    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized: No organization ID' }, { status: 401 });
    }

    const invite_token = nanoid(10);

    const { data, error } = await supabase
      .from('links')
      .insert({ 
        invite_token,
        internal_warehouse,
        logo,
        redirect_url: redirectUrl,
        organization: orgId
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}

export async function GET() {
  const supabase = createClient();
  const { userId, orgId } = auth();

  if (!orgId) {
    return NextResponse.json({ error: 'Unauthorized: No organization ID' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('links')
    .select('*')
    .eq('organization', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  try {
    const supabase = createClient();
    const { userId, orgId } = auth();
    const { id } = await request.json();

    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized: No organization ID' }, { status: 401 });
    }

    const { error } = await supabase
      .from('links')
      .delete()
      .match({ id, organization: orgId });

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}