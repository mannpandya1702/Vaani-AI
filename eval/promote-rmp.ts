// eval/promote-rmp.ts
// ╔══════════════════════════════════════════════════════════════════╗
// ║  Promote a Supabase user account to the `rmp` (or `admin`) role. ║
// ║                                                                   ║
// ║  Roles are stored in app_metadata.role and are ONLY settable by   ║
// ║  the service-role key — users cannot promote themselves. The     ║
// ║  RequireAuth component reads app_metadata.role to decide if the  ║
// ║  user can access /cockpit (rmp/admin) or only /asha (patient).   ║
// ║                                                                   ║
// ║  Run:                                                             ║
// ║    set -a && . ./.env.local && set +a && \                       ║
// ║    deno run --allow-env --allow-net \                            ║
// ║      eval/promote-rmp.ts <email_or_phone> [role]                 ║
// ║                                                                   ║
// ║  Defaults role to "rmp". Pass "admin" or "patient" to set those. ║
// ║  Pass "demote" to reset to "patient".                            ║
// ╚══════════════════════════════════════════════════════════════════╝

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env');
  Deno.exit(2);
}

const arg = Deno.args[0];
const roleArg = (Deno.args[1] ?? 'rmp').toLowerCase();
if (!arg) {
  console.error('Usage: deno run --allow-env --allow-net eval/promote-rmp.ts <email_or_phone> [rmp|admin|patient|demote]');
  Deno.exit(2);
}
const targetRole = roleArg === 'demote' ? 'patient' : roleArg;
if (!['rmp', 'admin', 'patient'].includes(targetRole)) {
  console.error(`Bad role: ${roleArg}. Use rmp | admin | patient | demote.`);
  Deno.exit(2);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Resolve the user — by email if it looks like one, else by phone.
const isEmail = arg.includes('@');
console.log(`Looking up user by ${isEmail ? 'email' : 'phone'}: ${arg}`);

const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
if (error) { console.error('listUsers failed:', error.message); Deno.exit(1); }

const user = data.users.find((u) =>
  isEmail
    ? u.email?.toLowerCase() === arg.toLowerCase()
    : u.phone === arg.replace(/^\+?/, '+').replace(/\D(?!\d)/g, ''),
);
if (!user) {
  console.error(`No Supabase user found for ${arg}.`);
  console.error('  Create one first by signing in via the /auth page; then re-run this.');
  Deno.exit(1);
}

const previous = (user.app_metadata?.role as string) ?? 'patient';
const { data: updated, error: updateErr } = await sb.auth.admin.updateUserById(user.id, {
  app_metadata: { ...user.app_metadata, role: targetRole },
});
if (updateErr) { console.error('updateUserById failed:', updateErr.message); Deno.exit(1); }

console.log(`✓ ${user.email ?? user.phone} : ${previous} → ${targetRole}`);
console.log(`  user_id: ${updated.user?.id}`);
console.log(`  app_metadata.role: ${updated.user?.app_metadata?.role}`);
console.log(`  next time they reload /cockpit or /asha, RequireAuth will route them accordingly.`);
