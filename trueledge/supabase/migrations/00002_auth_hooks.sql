-- ============================================================================
-- TrueLedge: Multi-Tenant SaaS Accounting Platform
-- Migration 00002: Auth Hooks & User Profile Trigger
-- ============================================================================
-- This migration creates:
--   1. Auto-create user profile trigger (on auth.users insert)
--   2. Custom Access Token Hook (injects org/entity claims into JWT)
-- ============================================================================

-- ============================================================================
-- 1. AUTO-CREATE USER PROFILE
-- ============================================================================
-- When a new user signs up via Supabase Auth, automatically create a
-- corresponding row in public.users with their email and metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 2. CUSTOM ACCESS TOKEN HOOK
-- ============================================================================
-- This function is called by Supabase Auth every time a JWT is minted.
-- It injects the user's organisation_id, entity_ids, and role into the
-- JWT app_metadata so RLS policies can read them without database lookups.
--
-- IMPORTANT: This function must be granted to supabase_auth_admin.
-- Enable via Supabase Dashboard > Auth > Hooks > Custom Access Token
-- ============================================================================
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims        JSONB;
  v_user_id     UUID;
  v_org_id      UUID;
  v_role_name   TEXT;
  v_entity_ids  JSONB;
BEGIN
  -- Extract user_id from the event
  v_user_id := (event ->> 'user_id')::uuid;

  -- Get the user's primary organisation and role
  SELECT
    ou.organisation_id,
    COALESCE(r.name, 'member')
  INTO v_org_id, v_role_name
  FROM public.organisation_users ou
  LEFT JOIN public.roles r ON r.id = ou.role_id
  WHERE ou.user_id = v_user_id
    AND ou.is_active = true
  ORDER BY ou.is_owner DESC, ou.joined_at ASC
  LIMIT 1;

  -- Get all entity_ids the user has access to
  SELECT COALESCE(jsonb_agg(eu.entity_id), '[]'::jsonb)
  INTO v_entity_ids
  FROM public.entity_users eu
  WHERE eu.user_id = v_user_id
    AND eu.is_active = true;

  -- Build the claims
  claims := event -> 'claims';

  -- Only inject if the user has an organisation
  IF v_org_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_metadata,organisation_id}', to_jsonb(v_org_id));
    claims := jsonb_set(claims, '{app_metadata,entity_ids}', v_entity_ids);
    claims := jsonb_set(claims, '{app_metadata,role}', to_jsonb(v_role_name));
  ELSE
    -- New user without an org yet — set empty claims
    claims := jsonb_set(claims, '{app_metadata,organisation_id}', 'null'::jsonb);
    claims := jsonb_set(claims, '{app_metadata,entity_ids}', '[]'::jsonb);
    claims := jsonb_set(claims, '{app_metadata,role}', '"none"'::jsonb);
  END IF;

  -- Return the modified event
  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- Grant execute to supabase_auth_admin so the hook can be called
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- Revoke from public and other roles for security
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM public;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM anon;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated;

-- ============================================================================
-- END OF MIGRATION 00002
-- ============================================================================
