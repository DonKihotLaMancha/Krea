// Supabase Edge Function template for heavy AI jobs.
// Deploy with: supabase functions deploy ai-jobs

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const body = await req.json();
    const jobType = String(body?.jobType || '').trim();

    // Keep simple for now: store queued job metadata so frontend stays responsive.
    const { data, error } = await supabase
      .from('notebook_outputs')
      .insert({
        session_id: body.sessionId,
        owner_id: body.userId,
        output_type: 'summary',
        payload: { queued: true, jobType, createdAt: new Date().toISOString() },
      })
      .select('id')
      .single();

    if (error) throw error;
    return new Response(JSON.stringify({ ok: true, jobId: data.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error?.message || error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

