import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export async function logActivity(action: string, details: Record<string, unknown> = {}, entity?: string, entityId?: string) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("audit_logs").insert({
    user_id: data.user.id,
    action,
    entity: entity ?? null,
    entity_id: entityId ?? null,
    details: details as Json,
  });
}
