-- AI_VERIFICATION_SPEC.md Phase 1
-- Store field-level extraction confidence and evidence.

CREATE TABLE IF NOT EXISTS public.poster_field_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poster_id UUID NOT NULL REFERENCES public.posters(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  value_text TEXT,
  value_json JSONB,
  confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_text TEXT,
  evidence_src TEXT NOT NULL CHECK (evidence_src IN ('ocr', 'body', 'attachment', 'rule', 'operator')),
  extractor TEXT NOT NULL,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poster_id, field_key, extractor)
);

CREATE INDEX IF NOT EXISTS idx_poster_field_evidence_poster_id
  ON public.poster_field_evidence(poster_id);

CREATE INDEX IF NOT EXISTS idx_poster_field_evidence_key_confidence
  ON public.poster_field_evidence(field_key, confidence);

CREATE INDEX IF NOT EXISTS idx_poster_field_evidence_public_poster
  ON public.poster_field_evidence(poster_id, field_key, confidence DESC);

ALTER TABLE public.poster_field_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "poster_field_evidence_select_public_published" ON public.poster_field_evidence;
CREATE POLICY "poster_field_evidence_select_public_published"
  ON public.poster_field_evidence
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.posters
      WHERE posters.id = poster_field_evidence.poster_id
        AND posters.poster_status = 'published'
    )
  );

-- No insert/update/delete policy is added intentionally.
-- Server-side jobs and Edge Functions use service_role, which bypasses RLS.

ALTER TABLE public.posters
  ADD COLUMN IF NOT EXISTS exposure_tier TEXT
    CHECK (exposure_tier IS NULL OR exposure_tier IN ('A', 'B', 'C')),
  ADD COLUMN IF NOT EXISTS tier_computed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tier_reason JSONB;

CREATE INDEX IF NOT EXISTS idx_posters_exposure_tier_published
  ON public.posters(exposure_tier)
  WHERE poster_status = 'published';

COMMENT ON TABLE public.poster_field_evidence IS
  'Field-level AI/rule/human extraction values with source evidence and calibrated confidence.';
COMMENT ON COLUMN public.poster_field_evidence.field_key IS
  'AI_VERIFICATION_SPEC field key such as deadline_date, host_org, official_url, age_min, benefit.';
COMMENT ON COLUMN public.poster_field_evidence.evidence_text IS
  'Original OCR/body/attachment/rule/operator evidence text, capped by writers to a short excerpt.';
COMMENT ON COLUMN public.posters.exposure_tier IS
  'Cached A/B/C exposure tier computed in AI verification Phase 3.';
