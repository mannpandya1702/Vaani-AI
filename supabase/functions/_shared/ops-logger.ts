// Ops incident logger — replaces ClinicPro's clickup-logger.ts.
// Writes to ops_incidents table + optional Slack webhook for ops alerts.
//
// Anand & Aman agreed: keep paper trail in DB (court-defensible),
// fire Slack only for ops awareness, never as primary record.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

type Severity = 'low' | 'medium' | 'high' | 'critical';

interface LogIncidentInput {
  severity: Severity;
  source: string;
  category?: string;
  title: string;
  description?: string;
  related_call_id?: string;
  related_tenant_id?: string;
  payload?: Record<string, unknown>;
}

export async function logOpsIncident(input: LogIncidentInput): Promise<void> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('logOpsIncident: missing Supabase env');
    return;
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { error } = await supabase.from('ops_incidents').insert({
    severity: input.severity,
    source: input.source,
    category: input.category,
    title: input.title,
    description: input.description,
    related_call_id: input.related_call_id,
    related_tenant_id: input.related_tenant_id,
    payload: input.payload ?? {},
  });
  if (error) {
    console.error('logOpsIncident insert error', error);
  }

  // Optional: also fire Slack for HIGH/CRITICAL
  if (input.severity === 'high' || input.severity === 'critical') {
    await fireSlack(input).catch((e) =>
      console.error('Slack alert failed', e),
    );
  }
}

async function fireSlack(input: LogIncidentInput): Promise<void> {
  const url = Deno.env.get('SLACK_WEBHOOK_URL');
  if (!url) return;
  const color = input.severity === 'critical' ? '#E5484D' : '#FF9F1C';
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attachments: [
        {
          color,
          title: `[${input.severity.toUpperCase()}] ${input.title}`,
          text: input.description ?? '',
          fields: [
            { title: 'Source', value: input.source, short: true },
            { title: 'Category', value: input.category ?? '—', short: true },
          ],
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    }),
  });
}
