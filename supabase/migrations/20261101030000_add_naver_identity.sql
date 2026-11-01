-- Naver login identity, option B of docs/NAVER_LOGIN_SECURITY_DESIGN_2026-11-01.md
-- (design passed Codex review v4). NOT APPLIED: apply only with explicit approval.
--
-- Accounts are found by a keyed hash of the Naver response.id, never by e-mail.
-- One Naver identity (naver_subjects) maps to one account; its hashes are kept
-- per key version, and every write must carry a hash for every active version,
-- so the same Naver ID can never be linked to two accounts across a rotation.
-- Sign-in, sign-up and linking are a transaction state machine consumed by
-- conditional updates. Linking re-checks the account row under a lock and
-- refuses when the lock cannot be taken (no after-the-fact compensation).
--
-- Tables have RLS on and no grants: writes go only through the SECURITY
-- DEFINER functions below, executable by service_role (design 5-11). Members
-- read their own state through my_login_methods().
--
-- Rollback (nothing else references these objects):
--   DROP FUNCTION IF EXISTS public.my_login_methods(), public.naver_purge_transactions(),
--     public.naver_unlink(uuid), public.naver_find_user_by_email(text),
--     public.complete_naver_link(uuid, text, uuid, timestamptz),
--     public.naver_tx_complete_login(uuid, text, uuid), public.naver_tx_fail(uuid, text),
--     public.naver_tx_user_created(uuid, text, uuid), public.naver_tx_creating_user(uuid, text),
--     public.naver_tx_reauth_swap(uuid, text, text, jsonb, text),
--     public.naver_tx_confirm_email(uuid, text, text, uuid),
--     public.naver_tx_email_sent(uuid, text, text, text, text, uuid),
--     public.naver_tx_callback(uuid, text, text, jsonb),
--     public.naver_tx_start(text, text, text, uuid, uuid),
--     public._naver_resolve(jsonb, smallint[]), public._naver_covers_active(jsonb, smallint[]),
--     public._naver_active_versions();
--   DROP TABLE IF EXISTS public.naver_auth_transactions, public.naver_identity_events,
--     public.naver_subject_hashes, public.naver_subjects, public.naver_hash_keys;

CREATE TABLE public.naver_hash_keys (
  version smallint PRIMARY KEY CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('active', 'retired')),
  activated_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  CHECK ((status = 'retired') = (retired_at IS NOT NULL))
);

CREATE TABLE public.naver_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_at timestamptz NOT NULL DEFAULT now(),
  linked_via text NOT NULL CHECK (linked_via IN ('signup', 'link_session', 'link_email', 'recover')),
  last_login_at timestamptz
);

CREATE TABLE public.naver_subject_hashes (
  hash text PRIMARY KEY CHECK (hash ~ '^[0-9a-f]{64}$'),
  key_version smallint NOT NULL REFERENCES public.naver_hash_keys(version),
  subject_id uuid NOT NULL REFERENCES public.naver_subjects(id) ON DELETE CASCADE,
  UNIQUE (subject_id, key_version)
);

CREATE TABLE public.naver_identity_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN ('linked', 'recovered', 'unlinked', 'hash_added')),
  key_versions smallint[] NOT NULL DEFAULT '{}',
  transaction_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.naver_auth_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL CHECK (purpose IN ('login', 'link_session', 'reauth')),
  browser_secret_hash text NOT NULL CHECK (browser_secret_hash ~ '^[0-9a-f]{64}$'),
  oauth_state_hash text NOT NULL CHECK (oauth_state_hash ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'started' CHECK (state IN (
    'started', 'naver_verified', 'email_sent', 'email_verified',
    'creating_user', 'user_created', 'completed', 'failed', 'expired')),
  naver_hashes jsonb,
  flow text CHECK (flow IN ('login', 'signup', 'link_email', 'link_session')),
  email text,
  email_token_hash text CHECK (email_token_hash ~ '^[0-9a-f]{64}$'),
  target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_user_id uuid,
  session_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.naver_auth_transactions(id) ON DELETE CASCADE,
  attempts smallint NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (purpose <> 'link_session' OR session_user_id IS NOT NULL),
  CHECK (purpose <> 'reauth' OR parent_id IS NOT NULL),
  CHECK (state IN ('started', 'failed', 'expired') OR naver_hashes IS NOT NULL),
  CHECK (state NOT IN ('email_sent', 'email_verified', 'creating_user', 'user_created')
         OR (flow IN ('signup', 'link_email') AND email IS NOT NULL AND email_token_hash IS NOT NULL)),
  CHECK (flow IS DISTINCT FROM 'link_email' OR target_user_id IS NOT NULL),
  CHECK (state <> 'user_created' OR created_user_id IS NOT NULL)
);
CREATE INDEX naver_auth_transactions_expires_idx ON public.naver_auth_transactions (expires_at);

ALTER TABLE public.naver_hash_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.naver_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.naver_subject_hashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.naver_identity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.naver_auth_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.naver_hash_keys, public.naver_subjects, public.naver_subject_hashes,
  public.naver_identity_events, public.naver_auth_transactions FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------ helpers

-- Active key versions, locked so a rotation waits for (and is seen by) this call.
CREATE FUNCTION public._naver_active_versions()
RETURNS smallint[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v smallint[];
BEGIN
  PERFORM 1 FROM public.naver_hash_keys WHERE status = 'active' FOR SHARE;
  SELECT array_agg(version ORDER BY version) INTO v
    FROM public.naver_hash_keys WHERE status = 'active';
  RETURN v;
END $$;

-- True when the hashes carry a well-formed hash for every active version.
CREATE FUNCTION public._naver_covers_active(p_hashes jsonb, p_active smallint[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(cardinality(p_active), 0) > 0
    AND jsonb_typeof(p_hashes) = 'object'
    AND NOT EXISTS (
      SELECT 1 FROM unnest(p_active) AS v
       WHERE coalesce(p_hashes ->> v::text, '') !~ '^[0-9a-f]{64}$')
$$;

-- The account of these hashes, or null. Adds the hashes of active versions the
-- identity lacks (rotation). Hashes pointing at two identities stop everything.
CREATE FUNCTION public._naver_resolve(p_hashes jsonb, p_active smallint[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_subjects uuid[];
  v_subject uuid;
  v_user uuid;
  v_added smallint[] := '{}';
  v smallint;
BEGIN
  SELECT array_agg(DISTINCT h.subject_id) INTO v_subjects
    FROM public.naver_subject_hashes h
   WHERE h.hash IN (SELECT value FROM jsonb_each_text(p_hashes));
  IF v_subjects IS NULL THEN RETURN NULL; END IF;
  IF cardinality(v_subjects) > 1 THEN
    RAISE EXCEPTION 'naver identity conflict' USING ERRCODE = 'P0001';
  END IF;
  v_subject := v_subjects[1];
  SELECT user_id INTO v_user FROM public.naver_subjects WHERE id = v_subject FOR UPDATE;
  FOREACH v IN ARRAY p_active LOOP
    IF NOT EXISTS (SELECT 1 FROM public.naver_subject_hashes
                    WHERE subject_id = v_subject AND key_version = v) THEN
      -- A hash already held by another identity raises unique_violation.
      INSERT INTO public.naver_subject_hashes (hash, key_version, subject_id)
      VALUES (p_hashes ->> v::text, v, v_subject);
      v_added := v_added || v;
    END IF;
  END LOOP;
  UPDATE public.naver_subjects SET last_login_at = now() WHERE id = v_subject;
  IF cardinality(v_added) > 0 THEN
    INSERT INTO public.naver_identity_events (user_id, event, key_versions)
    VALUES (v_user, 'hash_added', v_added);
  END IF;
  RETURN v_user;
END $$;

-- ------------------------------------------------------------- transactions

CREATE FUNCTION public.naver_tx_start(
  p_purpose text, p_browser_secret_hash text, p_oauth_state_hash text,
  p_session_user_id uuid DEFAULT NULL, p_parent_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.naver_auth_transactions
    (purpose, browser_secret_hash, oauth_state_hash, session_user_id, parent_id, expires_at)
  VALUES (p_purpose, p_browser_secret_hash, p_oauth_state_hash,
          CASE WHEN p_purpose = 'link_session' THEN p_session_user_id END,
          CASE WHEN p_purpose = 'reauth' THEN p_parent_id END,
          now() + interval '30 minutes')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- started -> naver_verified (login, link_session). For a login, resolves the
-- account; target_user_id is null when this Naver ID is not linked yet.
CREATE FUNCTION public.naver_tx_callback(
  p_id uuid, p_secret_hash text, p_state_hash text, p_hashes jsonb)
RETURNS TABLE (purpose text, flow text, target_user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_active smallint[] := public._naver_active_versions();
  tx public.naver_auth_transactions;
  v_user uuid;
BEGIN
  IF NOT public._naver_covers_active(p_hashes, v_active) THEN
    UPDATE public.naver_auth_transactions t SET state = 'failed', updated_at = now()
     WHERE t.id = p_id AND t.state = 'started' AND t.browser_secret_hash = p_secret_hash;
    RETURN;
  END IF;
  UPDATE public.naver_auth_transactions t
     SET state = 'naver_verified', naver_hashes = p_hashes, updated_at = now()
   WHERE t.id = p_id AND t.state = 'started' AND t.purpose <> 'reauth'
     AND t.expires_at > now() AND t.browser_secret_hash = p_secret_hash
     AND t.oauth_state_hash = p_state_hash
  RETURNING * INTO tx;
  IF NOT FOUND THEN RETURN; END IF;
  IF tx.purpose = 'login' THEN
    v_user := public._naver_resolve(p_hashes, v_active);
    IF v_user IS NOT NULL THEN
      UPDATE public.naver_auth_transactions t
         SET flow = 'login', target_user_id = v_user WHERE t.id = tx.id;
    END IF;
    RETURN QUERY SELECT tx.purpose, CASE WHEN v_user IS NOT NULL THEN 'login' END, v_user;
  ELSE
    UPDATE public.naver_auth_transactions t
       SET flow = 'link_session', target_user_id = tx.session_user_id WHERE t.id = tx.id;
    RETURN QUERY SELECT tx.purpose, 'link_session'::text, tx.session_user_id;
  END IF;
END $$;

-- naver_verified -> email_sent, for a login whose Naver ID is not linked.
CREATE FUNCTION public.naver_tx_email_sent(
  p_id uuid, p_secret_hash text, p_flow text, p_email text,
  p_email_token_hash text, p_target_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_flow NOT IN ('signup', 'link_email')
     OR (p_flow = 'signup') <> (p_target_user_id IS NULL) THEN
    RETURN false;
  END IF;
  UPDATE public.naver_auth_transactions t
     SET state = 'email_sent', flow = p_flow, email = lower(trim(p_email)),
         email_token_hash = p_email_token_hash, target_user_id = p_target_user_id,
         updated_at = now()
   WHERE t.id = p_id AND t.state = 'naver_verified' AND t.purpose = 'login'
     AND t.flow IS NULL AND t.expires_at > now() AND t.browser_secret_hash = p_secret_hash;
  RETURN FOUND;
END $$;

-- email_sent -> email_verified: the mail token, in the browser that holds the
-- transaction secret. A signed-in browser must be the target account (none for
-- a sign-up). Five wrong tokens fail the transaction.
CREATE FUNCTION public.naver_tx_confirm_email(
  p_id uuid, p_secret_hash text, p_email_token_hash text, p_session_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  tx public.naver_auth_transactions;
BEGIN
  SELECT * INTO tx FROM public.naver_auth_transactions t
   WHERE t.id = p_id AND t.state = 'email_sent' AND t.expires_at > now()
     AND t.browser_secret_hash = p_secret_hash
   FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF tx.email_token_hash IS DISTINCT FROM p_email_token_hash THEN
    UPDATE public.naver_auth_transactions t
       SET attempts = attempts + 1,
           state = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE state END,
           updated_at = now()
     WHERE t.id = tx.id;
    RETURN false;
  END IF;
  IF (tx.flow = 'signup' AND p_session_user_id IS NOT NULL)
     OR (tx.flow = 'link_email' AND p_session_user_id IS NOT NULL
         AND p_session_user_id <> tx.target_user_id) THEN
    UPDATE public.naver_auth_transactions t SET state = 'failed', updated_at = now()
     WHERE t.id = tx.id;
    RETURN false;
  END IF;
  UPDATE public.naver_auth_transactions t SET state = 'email_verified', updated_at = now()
   WHERE t.id = tx.id;
  RETURN true;
END $$;

-- A browser without the secret re-authenticated with Naver (child transaction).
-- Hashes are compared per key version; on a match the parent moves to the new
-- browser secret. No common version (rotation in between) or a mismatch fails
-- the parent.
CREATE FUNCTION public.naver_tx_reauth_swap(
  p_child_id uuid, p_child_secret_hash text, p_child_state_hash text,
  p_hashes jsonb, p_new_secret_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_parent_id uuid;
  parent public.naver_auth_transactions;
  v_common int;
  v_differ int;
BEGIN
  UPDATE public.naver_auth_transactions t
     SET state = 'completed', naver_hashes = p_hashes, updated_at = now()
   WHERE t.id = p_child_id AND t.purpose = 'reauth' AND t.state = 'started'
     AND t.expires_at > now() AND t.browser_secret_hash = p_child_secret_hash
     AND t.oauth_state_hash = p_child_state_hash
  RETURNING t.parent_id INTO v_parent_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO parent FROM public.naver_auth_transactions t
   WHERE t.id = v_parent_id FOR UPDATE;
  IF NOT FOUND OR parent.state <> 'email_sent' OR parent.expires_at <= now() THEN
    RETURN false;
  END IF;
  SELECT count(*), count(*) FILTER (WHERE c.value <> parent.naver_hashes ->> c.key)
    INTO v_common, v_differ
    FROM jsonb_each_text(coalesce(p_hashes, '{}'::jsonb)) c
   WHERE parent.naver_hashes ? c.key;
  IF v_common = 0 OR v_differ > 0 THEN
    UPDATE public.naver_auth_transactions t SET state = 'failed', updated_at = now()
     WHERE t.id = parent.id;
    RETURN false;
  END IF;
  UPDATE public.naver_auth_transactions t
     SET browser_secret_hash = p_new_secret_hash, updated_at = now()
   WHERE t.id = parent.id;
  RETURN true;
END $$;

-- email_verified -> creating_user (sign-up). Also returns for a retry while
-- still creating_user. Returns the e-mail the account is created with.
CREATE FUNCTION public.naver_tx_creating_user(p_id uuid, p_secret_hash text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_email text;
BEGIN
  UPDATE public.naver_auth_transactions t
     SET state = 'creating_user', updated_at = now()
   WHERE t.id = p_id AND t.flow = 'signup' AND t.state IN ('email_verified', 'creating_user')
     AND t.expires_at > now() AND t.browser_secret_hash = p_secret_hash
  RETURNING t.email INTO v_email;
  RETURN v_email;
END $$;

-- creating_user -> user_created, only for the account created by this very
-- transaction (app_metadata.naver_tx, which members cannot edit).
CREATE FUNCTION public.naver_tx_user_created(p_id uuid, p_secret_hash text, p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.naver_auth_transactions t
     SET state = 'user_created', created_user_id = p_user_id, updated_at = now()
   WHERE t.id = p_id AND t.flow = 'signup' AND t.expires_at > now()
     AND t.browser_secret_hash = p_secret_hash
     AND (t.state = 'creating_user' OR (t.state = 'user_created' AND t.created_user_id = p_user_id))
     AND EXISTS (SELECT 1 FROM auth.users u
                  WHERE u.id = p_user_id AND lower(u.email) = t.email
                    AND u.raw_app_meta_data ->> 'naver_tx' = t.id::text);
  RETURN FOUND;
END $$;

CREATE FUNCTION public.naver_tx_fail(p_id uuid, p_secret_hash text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.naver_auth_transactions t SET state = 'failed', updated_at = now()
   WHERE t.id = p_id AND t.browser_secret_hash = p_secret_hash
     AND t.state NOT IN ('completed', 'failed', 'expired');
$$;

-- naver_verified -> completed after the session for target_user_id was issued.
CREATE FUNCTION public.naver_tx_complete_login(p_id uuid, p_secret_hash text, p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.naver_auth_transactions t SET state = 'completed', updated_at = now()
   WHERE t.id = p_id AND t.flow = 'login' AND t.state = 'naver_verified'
     AND t.target_user_id = p_user_id AND t.expires_at > now()
     AND t.browser_secret_hash = p_secret_hash;
  RETURN FOUND;
END $$;

-- -------------------------------------------------------------- final link

-- Links (or, for an identity with no active-version hash, recovers) the Naver
-- identity of the transaction to its account, after re-checking everything in
-- this database transaction with the account row locked. Returns the account,
-- or null (transaction failed, nothing linked).
CREATE FUNCTION public.complete_naver_link(
  p_tx_id uuid, p_secret_hash text,
  p_session_user_id uuid DEFAULT NULL, p_recent_auth_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_active smallint[] := public._naver_active_versions();
  tx public.naver_auth_transactions;
  v_expected text;
  v_target uuid;
  u record;
  v_subject uuid;
  v_event text;
  v smallint;
BEGIN
  SELECT * INTO tx FROM public.naver_auth_transactions t WHERE t.id = p_tx_id FOR UPDATE;
  IF NOT FOUND OR tx.browser_secret_hash <> p_secret_hash THEN RETURN NULL; END IF;
  v_expected := CASE tx.flow WHEN 'signup' THEN 'user_created'
                             WHEN 'link_email' THEN 'email_verified'
                             WHEN 'link_session' THEN 'naver_verified' END;
  IF v_expected IS NULL OR tx.state <> v_expected THEN RETURN NULL; END IF;
  IF tx.expires_at <= now() OR NOT public._naver_covers_active(tx.naver_hashes, v_active) THEN
    UPDATE public.naver_auth_transactions t SET state = 'failed', updated_at = now() WHERE t.id = tx.id;
    RETURN NULL;
  END IF;
  v_target := CASE WHEN tx.flow = 'signup' THEN tx.created_user_id ELSE tx.target_user_id END;

  -- Final re-check with the account row locked. Without the lock, no link.
  BEGIN
    SELECT a.id, a.email, a.email_confirmed_at, a.email_change, a.banned_until,
           a.deleted_at, a.raw_app_meta_data
      INTO u FROM auth.users a WHERE a.id = v_target FOR SHARE;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.naver_auth_transactions t SET state = 'failed', updated_at = now() WHERE t.id = tx.id;
    RETURN NULL;
  END;
  IF u.id IS NULL
     OR u.deleted_at IS NOT NULL
     OR (u.banned_until IS NOT NULL AND u.banned_until > now())
     OR u.email_confirmed_at IS NULL
     OR coalesce(u.email_change, '') <> ''
     OR (tx.flow IN ('signup', 'link_email') AND lower(coalesce(u.email, '')) <> tx.email)
     OR (tx.flow = 'signup' AND u.raw_app_meta_data ->> 'naver_tx' IS DISTINCT FROM tx.id::text)
     OR (tx.flow = 'link_session' AND (
           p_session_user_id IS DISTINCT FROM tx.session_user_id
           OR p_session_user_id IS DISTINCT FROM v_target
           OR p_recent_auth_at IS NULL
           OR p_recent_auth_at < now() - interval '10 minutes')) THEN
    UPDATE public.naver_auth_transactions t SET state = 'failed', updated_at = now() WHERE t.id = tx.id;
    RETURN NULL;
  END IF;

  SELECT s.id INTO v_subject FROM public.naver_subjects s WHERE s.user_id = v_target FOR UPDATE;
  BEGIN
    IF v_subject IS NULL THEN
      INSERT INTO public.naver_subjects (user_id, linked_via) VALUES (v_target, tx.flow)
      RETURNING id INTO v_subject;
      v_event := 'linked';
    ELSIF EXISTS (SELECT 1 FROM public.naver_subject_hashes h
                   WHERE h.subject_id = v_subject AND h.key_version = ANY (v_active)) THEN
      -- Already linked with a usable hash: unlink first.
      UPDATE public.naver_auth_transactions t SET state = 'failed', updated_at = now() WHERE t.id = tx.id;
      RETURN NULL;
    ELSE
      -- Recovery after a key was lost or retired: keep the identity row, replace its hashes.
      DELETE FROM public.naver_subject_hashes h WHERE h.subject_id = v_subject;
      UPDATE public.naver_subjects s SET linked_via = 'recover', linked_at = now() WHERE s.id = v_subject;
      v_event := 'recovered';
    END IF;
    FOREACH v IN ARRAY v_active LOOP
      INSERT INTO public.naver_subject_hashes (hash, key_version, subject_id)
      VALUES (tx.naver_hashes ->> v::text, v, v_subject);
    END LOOP;
  EXCEPTION WHEN unique_violation THEN
    -- This Naver ID belongs to another account; everything above is undone.
    UPDATE public.naver_auth_transactions t SET state = 'failed', updated_at = now() WHERE t.id = tx.id;
    RETURN NULL;
  END;
  INSERT INTO public.naver_identity_events (user_id, event, key_versions, transaction_id)
  VALUES (v_target, v_event, v_active, tx.id);
  UPDATE public.naver_auth_transactions t SET state = 'completed', updated_at = now() WHERE t.id = tx.id;
  RETURN v_target;
END $$;

-- ------------------------------------------------------------------- others

-- Exactly one live account with this e-mail: its id and the transaction that
-- created it (if any). Nothing else is returned.
CREATE FUNCTION public.naver_find_user_by_email(p_email text)
RETURNS TABLE (user_id uuid, naver_tx text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.id, a.raw_app_meta_data ->> 'naver_tx'
    FROM auth.users a
   WHERE lower(a.email) = lower(trim(p_email)) AND a.deleted_at IS NULL
     AND (SELECT count(*) FROM auth.users b
           WHERE lower(b.email) = lower(trim(p_email)) AND b.deleted_at IS NULL) = 1
$$;

-- Removes the Naver link only while another sign-in method remains.
CREATE FUNCTION public.naver_unlink(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = p_user_id) THEN
    RETURN false;
  END IF;
  DELETE FROM public.naver_subjects s WHERE s.user_id = p_user_id;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.naver_identity_events (user_id, event) VALUES (p_user_id, 'unlinked');
  RETURN true;
END $$;

-- Transactions: unfinished ones past expiry become expired; finished ones are
-- deleted after 7 days, expired ones after 1 day. Returns rows deleted.
CREATE FUNCTION public.naver_purge_transactions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_deleted integer;
BEGIN
  UPDATE public.naver_auth_transactions SET state = 'expired', updated_at = now()
   WHERE expires_at <= now() AND state NOT IN ('completed', 'failed', 'expired');
  DELETE FROM public.naver_auth_transactions
   WHERE (state IN ('completed', 'failed') AND updated_at < now() - interval '7 days')
      OR (state = 'expired' AND updated_at < now() - interval '1 day');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END $$;

-- The signed-in member's Naver link, for 연결된 로그인.
CREATE FUNCTION public.my_login_methods()
RETURNS TABLE (naver_linked boolean, naver_linked_at timestamptz, naver_needs_relink boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.id IS NOT NULL,
         s.linked_at,
         s.id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.naver_subject_hashes h
             JOIN public.naver_hash_keys k ON k.version = h.key_version AND k.status = 'active'
            WHERE h.subject_id = s.id)
    FROM (SELECT auth.uid() AS uid) me
    LEFT JOIN public.naver_subjects s ON s.user_id = me.uid
   WHERE me.uid IS NOT NULL
$$;

REVOKE ALL ON FUNCTION
  public._naver_active_versions(), public._naver_covers_active(jsonb, smallint[]),
  public._naver_resolve(jsonb, smallint[]),
  public.naver_tx_start(text, text, text, uuid, uuid),
  public.naver_tx_callback(uuid, text, text, jsonb),
  public.naver_tx_email_sent(uuid, text, text, text, text, uuid),
  public.naver_tx_confirm_email(uuid, text, text, uuid),
  public.naver_tx_reauth_swap(uuid, text, text, jsonb, text),
  public.naver_tx_creating_user(uuid, text),
  public.naver_tx_user_created(uuid, text, uuid),
  public.naver_tx_fail(uuid, text),
  public.naver_tx_complete_login(uuid, text, uuid),
  public.complete_naver_link(uuid, text, uuid, timestamptz),
  public.naver_find_user_by_email(text),
  public.naver_unlink(uuid),
  public.naver_purge_transactions(),
  public.my_login_methods()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.naver_tx_start(text, text, text, uuid, uuid),
  public.naver_tx_callback(uuid, text, text, jsonb),
  public.naver_tx_email_sent(uuid, text, text, text, text, uuid),
  public.naver_tx_confirm_email(uuid, text, text, uuid),
  public.naver_tx_reauth_swap(uuid, text, text, jsonb, text),
  public.naver_tx_creating_user(uuid, text),
  public.naver_tx_user_created(uuid, text, uuid),
  public.naver_tx_fail(uuid, text),
  public.naver_tx_complete_login(uuid, text, uuid),
  public.complete_naver_link(uuid, text, uuid, timestamptz),
  public.naver_find_user_by_email(text),
  public.naver_unlink(uuid),
  public.naver_purge_transactions()
TO service_role;

GRANT EXECUTE ON FUNCTION public.my_login_methods() TO authenticated;

NOTIFY pgrst, 'reload schema';
