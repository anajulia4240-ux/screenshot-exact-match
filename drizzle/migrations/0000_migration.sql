
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'operator');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_member(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member(uuid) TO authenticated;

CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- New user: profile + first user becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Contacts
CREATE TYPE public.contact_status AS ENUM ('active','inactive','unsubscribed','blocked','bounced');

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text,
  email text,
  phone text,
  company text,
  source text,
  status public.contact_status NOT NULL DEFAULT 'active',
  email_valid boolean NOT NULL DEFAULT false,
  phone_valid boolean NOT NULL DEFAULT false,
  allow_email boolean NOT NULL DEFAULT false,
  allow_whatsapp boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  consent_source text,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX contacts_email_uniq ON public.contacts (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX contacts_phone_uniq ON public.contacts (phone) WHERE phone IS NOT NULL;
CREATE INDEX contacts_status_idx ON public.contacts (status);
CREATE INDEX contacts_created_idx ON public.contacts (created_at DESC);
CREATE TRIGGER contacts_touch BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.contact_tags (
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, tag_id)
);
CREATE INDEX contact_tags_tag_idx ON public.contact_tags (tag_id);

CREATE TABLE public.lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  kind text NOT NULL DEFAULT 'static' CHECK (kind IN ('static','segment')),
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER lists_touch BEFORE UPDATE ON public.lists FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.list_members (
  list_id uuid NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, contact_id)
);
CREATE INDEX list_members_contact_idx ON public.list_members (contact_id);

-- Templates and campaigns
CREATE TYPE public.channel AS ENUM ('email','whatsapp');
CREATE TYPE public.campaign_status AS ENUM ('draft','scheduled','queued','sending','paused','completed','cancelled','failed');

CREATE TABLE public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel public.channel NOT NULL,
  name text NOT NULL,
  category text,
  subject text,
  body_html text,
  body_text text,
  provider_template_name text,
  provider_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER templates_touch BEFORE UPDATE ON public.message_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel public.channel NOT NULL,
  name text NOT NULL,
  status public.campaign_status NOT NULL DEFAULT 'draft',
  from_name text,
  from_email text,
  reply_to text,
  subject text,
  body_html text,
  body_text text,
  template_id uuid REFERENCES public.message_templates(id) ON DELETE SET NULL,
  list_ids uuid[] NOT NULL DEFAULT '{}',
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_status_idx ON public.campaigns (status);
CREATE TRIGGER campaigns_touch BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TYPE public.delivery_status AS ENUM ('pending','excluded','sending','accepted','delivered','opened','clicked','read','replied','bounced','failed');

CREATE TABLE public.campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel public.channel NOT NULL,
  status public.delivery_status NOT NULL DEFAULT 'pending',
  exclusion_reason text,
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, contact_id)
);
CREATE INDEX recipients_status_idx ON public.campaign_recipients (campaign_id, status);
CREATE INDEX recipients_queue_idx ON public.campaign_recipients (status, next_attempt_at);
CREATE INDEX recipients_provider_idx ON public.campaign_recipients (provider_message_id);
CREATE INDEX recipients_contact_idx ON public.campaign_recipients (contact_id);
CREATE TRIGGER recipients_touch BEFORE UPDATE ON public.campaign_recipients FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.message_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid REFERENCES public.campaign_recipients(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  channel public.channel NOT NULL,
  event_type text NOT NULL,
  provider_message_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX message_events_time_idx ON public.message_events (occurred_at DESC);
CREATE INDEX message_events_campaign_idx ON public.message_events (campaign_id, event_type);

CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  external_id text,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);

-- Automations
CREATE TABLE public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_type text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER automations_touch BEFORE UPDATE ON public.automations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TABLE public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  step int NOT NULL DEFAULT 0,
  run_at timestamptz NOT NULL DEFAULT now(),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX automation_runs_queue_idx ON public.automation_runs (status, run_at);

-- Suppression
CREATE TABLE public.suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel public.channel,
  email text,
  phone text,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  reason text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX suppressions_email_idx ON public.suppressions (lower(email));
CREATE INDEX suppressions_phone_idx ON public.suppressions (phone);

-- Audit + settings (non-secret)
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity text,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_time_idx ON public.audit_logs (created_at DESC);

CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Grants + RLS for member-shared tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contacts','tags','contact_tags','lists','list_members','message_templates','campaigns','campaign_recipients','message_events','automations','automation_runs','suppressions']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "members select" ON public.%I FOR SELECT TO authenticated USING (public.is_member(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "members insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_member(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "members update" ON public.%I FOR UPDATE TO authenticated USING (public.is_member(auth.uid())) WITH CHECK (public.is_member(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "members delete" ON public.%I FOR DELETE TO authenticated USING (public.is_member(auth.uid()))', t);
  END LOOP;
END $$;

-- Suppressions cannot be deleted by operators, only admins
DROP POLICY "members delete" ON public.suppressions;
CREATE POLICY "admins delete" ON public.suppressions FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read audit" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "members write audit" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_member(auth.uid()) AND user_id = auth.uid());

GRANT ALL ON public.webhook_events TO service_role;
GRANT SELECT ON public.webhook_events TO authenticated;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read webhooks" ON public.webhook_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read settings" ON public.app_settings FOR SELECT TO authenticated USING (public.is_member(auth.uid()));
CREATE POLICY "admins write settings" ON public.app_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins update settings" ON public.app_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Dashboard stats (real data)
CREATE OR REPLACE FUNCTION public.dashboard_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_member(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'contacts_total', (SELECT count(*) FROM contacts),
    'contacts_active', (SELECT count(*) FROM contacts WHERE status='active'),
    'contacts_email_valid', (SELECT count(*) FROM contacts WHERE email_valid),
    'contacts_phone_valid', (SELECT count(*) FROM contacts WHERE phone_valid),
    'campaigns_total', (SELECT count(*) FROM campaigns),
    'campaigns_running', (SELECT count(*) FROM campaigns WHERE status IN ('queued','sending')),
    'sent', (SELECT count(*) FROM campaign_recipients WHERE status NOT IN ('pending','excluded','sending','failed')),
    'delivered', (SELECT count(*) FROM campaign_recipients WHERE delivered_at IS NOT NULL),
    'failed', (SELECT count(*) FROM campaign_recipients WHERE status IN ('failed','bounced')),
    'opened', (SELECT count(*) FROM campaign_recipients WHERE opened_at IS NOT NULL),
    'clicked', (SELECT count(*) FROM campaign_recipients WHERE clicked_at IS NOT NULL),
    'replies', (SELECT count(*) FROM message_events WHERE event_type='reply')
  ) INTO r;
  RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.dashboard_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.daily_activity(_days int DEFAULT 30)
RETURNS TABLE(day date, channel public.channel, sent bigint, failed bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT date_trunc('day', COALESCE(sent_at, updated_at))::date, channel,
    count(*) FILTER (WHERE status NOT IN ('pending','excluded','sending','failed','bounced')),
    count(*) FILTER (WHERE status IN ('failed','bounced'))
  FROM campaign_recipients
  WHERE COALESCE(sent_at, updated_at) >= now() - make_interval(days => _days)
    AND status NOT IN ('pending','excluded')
  GROUP BY 1,2 ORDER BY 1
$$;
GRANT EXECUTE ON FUNCTION public.daily_activity(int) TO authenticated;
