import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { auth } from '@clerk/nextjs/server';

export async function GET(request: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get('organizationId');

  if (!organizationId) {
    return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 });
  }

  const { data: warehouses, error } = await supabase
    .from('warehouses')
    .select('id, created_at')
    .eq('organization', organizationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ warehouses });
}

export async function POST(request: Request) {
    const supabase = createClient();
    const { userId, orgId } = auth();
    const slug = auth().orgSlug;
    
    if (!userId || !orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    try {
      const { credentials } = await request.json();
  
      // Validate input
      if (!credentials) {
        return NextResponse.json({ error: 'Type and credentials are required' }, { status: 400 });
      }
  
      const { data, error } = await supabase
        .from('warehouses')
        .insert({ credentials, organization: orgId, slug  })
        .select()
        .single();
  
      if (error) {
        console.error('Supabase error:', error);
        return NextResponse.json({ error: 'Failed to insert warehouse' }, { status: 500 });
      }
  
      return NextResponse.json({ data });
    } catch (error) {
      console.error('Unexpected error:', error);
      return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
    }
  }

export async function DELETE(request: Request) {
  const supabase = createClient();
  const { id } = await request.json();

  const { error } = await supabase
    .from('warehouses')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}