import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import * as pulumi from "@pulumi/pulumi";
import * as docker from "@pulumi/docker";
import { Octokit } from "@octokit/core";
import { createClient as ClickhouseClient } from '@clickhouse/client';

interface Table {
    name: string;
}

interface ShowTablesResponse {
    data: Table[];
}

// Define the destination config schema to match the required structure
const destinationConfigSchema = z.object({
    type: z.string(),
    credentials: z.record(z.any()),  // Allow any key-value pairs
    options: z.object({
        mode: z.enum(["stream", "batch"]).default("stream"),
        batchSize: z.number().default(10000),
    }).default({
        mode: "stream",
        batchSize: 10000
    }),
}).strict();  // Ensure no extra properties

// Validation schema for the request body
const requestSchema = z.object({
    organization: z.string().min(1),
    internal_warehouse: z.string().min(1),
    link_type: z.string().min(1),
    internal_credentials: z.record(z.any()),  // Allow any key-value pairs
    destination_config: destinationConfigSchema,
}).strict();  // Ensure no extra properties

// Create Octokit instance
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});

async function getAllTables(request: NextRequest): Promise<string[]> {
    try {
        const body = await request.json();
        const clickhouse = ClickhouseClient({
            host: body.internal_credentials.host,  // Replace with your ClickHouse host
            username: body.internal_credentials.username,  // Replace with your ClickHouse username
            password: body.internal_credentials.password,  // Replace with your ClickHouse password
            database: body.internal_credentials.database,  // Replace with your ClickHouse database
        });

        const result = await clickhouse.query({
            query: 'SHOW TABLES',
            format: 'JSON',  // You can choose the format (JSON or any supported)
        });

        const tables: ShowTablesResponse = await result.json();
        const tableNames = tables.data.map((table) => table.name);
        console.log('Tables:', tableNames);
        return tableNames;
    } catch (error) {
        console.error('Error fetching tables:', error);
        throw error;
    }
}

async function getTableData(request: NextRequest) {
    try {
        const body = await request.json();
        const clickhouse = ClickhouseClient({
            host: body.internal_credentials.host,  // Replace with your ClickHouse host
            username: body.internal_credentials.username,  // Replace with your ClickHouse username
            password: body.internal_credentials.password,  // Replace with your ClickHouse password
            database: body.internal_credentials.database,  // Replace with your ClickHouse database
        });

        // Fetch the list of tables
        const tables = await getAllTables(request);

        // Define an object to hold all table data
        const allTableData: Record<string, any> = {};  // Dynamic keys with 'any' type for values
    
        // Loop through each table and fetch its data
        for (const table of tables) {
            const query = `SELECT * FROM ${table} FORMAT JSONCompactEachRowWithNamesAndTypes`;
            const result = await clickhouse.query({ query });
            const tableData = await result.json();
            allTableData[table] = tableData;
        }
        
        console.log('All Table Data:', allTableData);
        return allTableData;
    } catch (error) {
        console.error('Error fetching table data:', error);
        throw error;
    }
}
    
// POST handler
export async function POST(request: NextRequest) {
    const supabase = createClient();
    let syncId: string | null = null;
    const data = await getTableData(request);
    try {
        // Parse request body first
        const rawBody = await request.json().catch(() => {
            throw new Error('Invalid JSON in request body');
        });

        // Validate request body
        const validationResult = requestSchema.safeParse(rawBody);
        
        if (!validationResult.success) {
            console.error('Validation errors:', validationResult.error.issues);
            return NextResponse.json({
                success: false,
                error: 'Validation failed',
                details: validationResult.error.issues
            }, { status: 400 });
        }

        const body = validationResult.data;

        // Normalize link_type case
        const linkType = body.link_type.toLowerCase();

        // Create sync record with error handling
        const { data: syncData, error: syncError } = await supabase
            .from('syncs')
            .insert({
                organization: body.organization,
                internal_warehouse: body.internal_warehouse,
                link_type: linkType,
                internal_credentials: body.internal_credentials,
                destination_config: body.destination_config,
            })
            .select()
            .single();

        if (syncError) {
            console.error('Database error:', syncError);
            return NextResponse.json({
                success: false,
                error: 'Database error',
                details: syncError.message
            }, { status: 500 });
        }

        if (!syncData) {
            return NextResponse.json({
                success: false,
                error: 'Failed to create sync record: No data returned'
            }, { status: 500 });
        }

        syncId = syncData.id;

        // Call getAllTables function with the request
        const tables = await getAllTables(request);
        console.log('Tables fetched:', tables);

        try {
            await octokit.request('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches', {
                owner: 'portcullis-co',
                repo: 'portcullis-app',
                workflow_id: 'deploy-bulker.yml',
                ref: 'bulker',
                inputs: {
                    org_id: body.organization,  // Map your 'organization' field to 'org_id'
                    data: JSON.stringify(data),  // Convert data to JSON string
                },
                headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });
        } catch (githubError: any) {
            console.error('GitHub API error:', githubError);
                
            return NextResponse.json({
                success: false,
                syncId,
                error: 'GitHub API error',
                details: githubError.message
            }, { status: 422 });
        }

        // Return success response
        return NextResponse.json({
            success: true,
            syncId,
            message: 'ETL process and container provisioning initiated successfully'
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
