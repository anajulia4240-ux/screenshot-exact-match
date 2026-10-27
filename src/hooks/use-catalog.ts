import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tags").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useLists() {
  return useQuery({
    queryKey: ["lists"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lists").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user!;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      return { id: user.id, isAdmin: (roles ?? []).some((r) => r.role === "admin") };
    },
  });
}

export const DEFAULT_TAG_COLOR = "#2563eb";
export const TAG_COLORS: string[] = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#4b5563",
];
