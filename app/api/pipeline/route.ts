import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import * as pulumi from "@pulumi/pulumi";
import * as docker from "@pulumi/docker";
import { Octokit } from "@octokit/core";

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
  })

export async function POST(request: NextRequest) {
  const supabase = createClient();
  let syncId: string | null = null;
  let container: docker.Container | null = null;

  try {
      const body = await request.json();
      const linkType = body.link_type.toLowerCase();

      // Create sync record
      const { data: syncData, error: syncError } = await supabase
          .from('syncs')
          .insert({
              organization: body.organization,
              internal_warehouse: body.internal_warehouse,
              link_type: body.link_type,
              internal_credentials: body.internal_credentials,
              destination_config: body.destinationConfig,
              status: 'active'
          })
          .select()
          .single();

      if (syncError) throw new Error(`Failed to create sync record: ${syncError.message}`);

      syncId = syncData.id;

      // Now use the resolved value in fetch
      const provisionBulker = await fetch('https://api.github.com/repos/portcullis-co/portcullis-app/actions/workflows/11474765079/dispatches', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify(body.destinationConfig)
      });

      if (!provisionBulker.ok) {
          throw new Error(`Failed to send data to Bulker: ${provisionBulker.statusText}`);
      }

      // Return success response
      return NextResponse.json({
          success: true,
          syncId,
          message: 'ETL process and container provisioning completed successfully'
      });

  } catch (error) {
      console.error('ETL process failed:', error);

      return NextResponse.json({
          success: false,
          syncId,
          error: error instanceof Error ? error.message : 'Unknown error occurred'
      }, { status: 500 });
  }
}
