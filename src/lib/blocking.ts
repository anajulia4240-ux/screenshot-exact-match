import { supabase } from "@/integrations/supabase/client";

/** Bloqueia em visitor_ips e espelha em banned_ips (insere ou reativa). */
export async function blockIp(ip: string, reason: string): Promise<void> {
  const now = new Date().toISOString();
  const v = await supabase.from("visitor_ips").update({ blocked: true, blocked_at: now, blocked_reason: reason }).eq("ip", ip);
  if (v.error) throw v.error;
  const b = await supabase.from("banned_ips").upsert(
    { ip, reason, attack_type: "manual", unbanned: false, last_attack_at: now },
    { onConflict: "ip" },
  );
  if (b.error) throw b.error;
}

/** Desfaz o bloqueio nos dois lugares. */
export async function unblockIp(ip: string): Promise<void> {
  const v = await supabase.from("visitor_ips").update({ blocked: false, permanent_block: false, blocked_reason: null }).eq("ip", ip);
  if (v.error) throw v.error;
  const b = await supabase.from("banned_ips").update({ unbanned: true }).eq("ip", ip);
  if (b.error) throw b.error;
}
