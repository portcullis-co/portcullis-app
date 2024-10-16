import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { auth } from '@clerk/nextjs/server';
import { use } from 'react';

export async function GET(request: Request) {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
  
    if (!organizationId) {
      return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 });
    }
  
    const { data: sources, error } = await supabase
      .from('sources')
      .select('*')
      .eq('organization', organizationId);
  
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  
    return NextResponse.json({ sources });
  }

export async function POST(request: Request) {
    const supabase = createClient();
    const { userId, orgId } = auth();
    const slug = auth().orgSlug;
    
    if (!userId || !orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    try {
      const { type, credentials } = await request.json();
  
      // Validate input
      if (!type || !credentials) {
        return NextResponse.json({ error: 'Type and credentials are required' }, { status: 400 });
      }
  
      // Validate credentials
      if (!validateCredentials(type, credentials)) {
        return NextResponse.json({ error: 'Invalid credentials for the selected type' }, { status: 400 });
      }
  
      const { data, error } = await supabase
        .from('sources')
        .insert({ type, credentials, organization: orgId, slug  })
        .select()
        .single();
  
      if (error) {
        console.error('Supabase error:', error);
        return NextResponse.json({ error: 'Failed to insert source' }, { status: 500 });
      }
  
      return NextResponse.json({ data });
    } catch (error) {
      console.error('Unexpected error:', error);
      return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
    }
  }
  
  // Make sure this function is defined in the same file
  function validateCredentials(type: string, credentials: any): boolean {
    const requiredFields: { [key: string]: string[] } = {
      snowflake: ['account', 'username', 'password', 'warehouse', 'database', 'schema'],
      bigquery: ['project_id', 'private_key', 'client_email'],
      redshift: ['host', 'port', 'database', 'user', 'password'],
      clickhouse: ['host', 'port', 'database', 'user', 'password'],
    };
  
    const fields = requiredFields[type];
    if (!fields) return false;
  
    return fields.every(field => credentials[field] && credentials[field].trim() !== '');
  }

export async function DELETE(request: Request) {
  const supabase = createClient();
  const { id } = await request.json();

  const { error } = await supabase
    .from('sources')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}