// eval/enable-custom-llm.ts
// ╔══════════════════════════════════════════════════════════════════╗
// ║  Flip a Vaani assistant from VAPI's managed Anthropic provider to║
// ║  our own vapi-custom-llm proxy. Brings:                          ║
// ║    - PII redaction on every turn (DPDP §16, Anand §3.9, ABDM HDM)║
// ║    - Hardcoded PCPNDT/MHCA/POCSO refusals fire pre-LLM           ║
// ║      (PCPNDT s.22, MHCA s.18) — bypass Claude entirely           ║
// ║    - prompt-cache active on the live voice path (~₹2 → ~₹0.40/   ║
// ║      consult LLM cost in steady state)                           ║
// ║    - per-turn cross_border_transfers audit row                   ║
// ║                                                                   ║
// ║  Idempotent — re-running just confirms the config is set.        ║
// ║                                                                   ║
// ║  Run:                                                             ║
// ║    set -a && . ./.env.local && set +a && \                       ║
// ║    deno run --allow-env --allow-net eval/enable-custom-llm.ts hi ║
// ║                                                                   ║
// ║  Args: hi | ta | both                                            ║
// ║                                                                   ║
// ║  To revert:                                                       ║
// ║    deno run --allow-env --allow-net eval/enable-custom-llm.ts \  ║
// ║      hi --revert                                                  ║
// ╚══════════════════════════════════════════════════════════════════╝

const PRIVATE = Deno.env.get('VAPI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const MASTER = Deno.env.get('WEBHOOK_MASTER_KEY');
const HI = Deno.env.get('VITE_VAPI_ASSISTANT_ID_HI');
const TA = Deno.env.get('VITE_VAPI_ASSISTANT_ID_TA');
const ESCALATE = Deno.env.get('VAPI_TOOL_ID_ESCALATE_TO_DOCTOR');
const CONSENT = Deno.env.get('VAPI_TOOL_ID_CAPTURE_CONSENT');

if (!PRIVATE || !SUPABASE_URL || !MASTER) {
  console.error('Missing VAPI_API_KEY / SUPABASE_URL / WEBHOOK_MASTER_KEY');
  Deno.exit(2);
}

const which = (Deno.args[0] ?? 'hi').toLowerCase();
const revert = Deno.args.includes('--revert');
const targets: { label: string; id: string | undefined }[] =
  which === 'both' ? [
    { label: 'Hindi', id: HI },
    { label: 'Tamil', id: TA },
  ] : which === 'ta'
    ? [{ label: 'Tamil', id: TA }]
    : [{ label: 'Hindi', id: HI }];

async function getAssistant(id: string): Promise<any> {
  const r = await fetch(`https://api.vapi.ai/assistant/${id}`, { headers: { Authorization: `Bearer ${PRIVATE}` } });
  if (!r.ok) throw new Error(`GET assistant ${r.status}`);
  return r.json();
}

async function patchAssistant(id: string, body: unknown): Promise<void> {
  const r = await fetch(`https://api.vapi.ai/assistant/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${PRIVATE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`PATCH ${r.status}: ${t.slice(0, 200)}`);
  }
}

for (const { label, id } of targets) {
  if (!id) { console.log(`SKIP ${label} — no assistant id`); continue; }
  const d = await getAssistant(id);
  const m = d.model ?? {};
  const messages = m.messages;
  const toolIds = m.toolIds && m.toolIds.length > 0 ? m.toolIds : [ESCALATE, CONSENT].filter(Boolean);

  if (revert) {
    // Restore VAPI's managed anthropic provider.
    const restored = {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      messages,
      toolIds,
    };
    await patchAssistant(id, { model: restored });
    console.log(`✓ ${label} reverted to VAPI's managed anthropic provider`);
    continue;
  }

  // Flip to custom-llm proxy. Preserve system prompt + tools.
  const flipped = {
    provider: 'custom-llm',
    model: 'claude-sonnet-4-6',
    url: `${SUPABASE_URL}/functions/v1/vapi-custom-llm`,
    headers: { Authorization: `Bearer ${MASTER}` },
    messages,
    toolIds,
  };
  await patchAssistant(id, { model: flipped });
  console.log(`✓ ${label} flipped to vapi-custom-llm proxy (${SUPABASE_URL}/functions/v1/vapi-custom-llm)`);
  console.log(`   PII redaction + PCPNDT/MHCA/POCSO live refusal active.`);
}
