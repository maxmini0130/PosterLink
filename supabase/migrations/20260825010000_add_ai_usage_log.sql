-- AI_VERIFICATION_SPEC.md Phase 6
-- Track AI model routing, call volume, and estimated costs.
--
-- This migration prepares the schema only. Applying it to production still
-- requires explicit operator approval.

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  stage INTEGER NOT NULL CHECK (stage BETWEEN 0 AND 3),
  stage_label TEXT NOT NULL CHECK (stage_label IN ('rule', 'cheap_text', 'high_text', 'vlm')),
  model TEXT NOT NULL,
  operation TEXT NOT NULL,
  poster_id UUID REFERENCES public.posters(id) ON DELETE SET NULL,
  field_key TEXT,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('planned', 'success', 'failed', 'skipped')),
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  image_count INTEGER NOT NULL DEFAULT 0 CHECK (image_count >= 0),
  estimated_unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (estimated_unit_cost >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_created_at
  ON public.ai_usage_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_stage_created_at
  ON public.ai_usage_log(stage_label, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_poster_id
  ON public.ai_usage_log(poster_id)
  WHERE poster_id IS NOT NULL;

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_usage_log_admin_select" ON public.ai_usage_log;
CREATE POLICY "ai_usage_log_admin_select"
  ON public.ai_usage_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- No browser insert/update/delete policy is added intentionally.
-- Trusted server jobs may write with the service role after application-level
-- checks and job logging.

CREATE OR REPLACE VIEW public.ai_usage_daily_overview AS
SELECT
  date_trunc('day', created_at AT TIME ZONE 'Asia/Seoul')::date AS day_kst,
  stage,
  stage_label,
  model,
  operation,
  status,
  count(*) AS call_count,
  coalesce(sum(input_tokens), 0) AS input_tokens,
  coalesce(sum(output_tokens), 0) AS output_tokens,
  coalesce(sum(image_count), 0) AS image_count,
  coalesce(sum(estimated_unit_cost), 0)::numeric(12,2) AS estimated_unit_cost
FROM public.ai_usage_log
GROUP BY 1, 2, 3, 4, 5, 6;

COMMENT ON TABLE public.ai_usage_log IS
  'Phase 6 AI usage ledger for model-tier routing, token/image volume, and estimated costs.';
COMMENT ON COLUMN public.ai_usage_log.estimated_unit_cost IS
  'Internal estimated cost units; configure writers to map this to real provider pricing.';
