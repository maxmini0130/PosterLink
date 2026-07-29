ALTER TABLE site_visit_logs
  ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'visitor',
  ADD COLUMN IF NOT EXISTS is_automated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS automation_source TEXT;

ALTER TABLE site_visit_logs
  DROP CONSTRAINT IF EXISTS site_visit_logs_actor_type_check;

ALTER TABLE site_visit_logs
  ADD CONSTRAINT site_visit_logs_actor_type_check
  CHECK (
    actor_type IN (
      'visitor',
      'member',
      'operator',
      'admin',
      'automation',
      'bot'
    )
  );

UPDATE site_visit_logs AS visit
SET
  actor_type = CASE
    WHEN profile.role IN ('admin', 'super_admin') THEN 'admin'
    WHEN profile.role = 'operator' THEN 'operator'
    WHEN profile.role = 'user' THEN 'member'
    WHEN COALESCE(visit.user_agent, '') ~* 'bot|crawler|spider|slurp|facebookexternalhit|kakaotalk-scrap|naverbot|googlebot'
      THEN 'bot'
    WHEN COALESCE(visit.user_agent, '') ~* 'headlesschrome|playwright|puppeteer|selenium|phantomjs|webdriver|codex|chatgpt|openai'
      THEN 'automation'
    ELSE 'visitor'
  END,
  is_automated = (
    COALESCE(visit.user_agent, '') ~* 'bot|crawler|spider|slurp|facebookexternalhit|kakaotalk-scrap|naverbot|googlebot|headlesschrome|playwright|puppeteer|selenium|phantomjs|webdriver|codex|chatgpt|openai'
  ),
  automation_source = CASE
    WHEN COALESCE(visit.user_agent, '') ~* 'bot|crawler|spider|slurp|facebookexternalhit|kakaotalk-scrap|naverbot|googlebot'
      THEN 'bot-user-agent'
    WHEN COALESCE(visit.user_agent, '') ~* 'headlesschrome|playwright|puppeteer|selenium|phantomjs|webdriver|codex|chatgpt|openai'
      THEN 'automation-user-agent'
    ELSE NULL
  END
FROM profiles AS profile
WHERE profile.id = visit.user_id;

UPDATE site_visit_logs AS visit
SET
  actor_type = CASE
    WHEN COALESCE(visit.user_agent, '') ~* 'bot|crawler|spider|slurp|facebookexternalhit|kakaotalk-scrap|naverbot|googlebot'
      THEN 'bot'
    WHEN COALESCE(visit.user_agent, '') ~* 'headlesschrome|playwright|puppeteer|selenium|phantomjs|webdriver|codex|chatgpt|openai'
      THEN 'automation'
    ELSE 'visitor'
  END,
  is_automated = (
    COALESCE(visit.user_agent, '') ~* 'bot|crawler|spider|slurp|facebookexternalhit|kakaotalk-scrap|naverbot|googlebot|headlesschrome|playwright|puppeteer|selenium|phantomjs|webdriver|codex|chatgpt|openai'
  ),
  automation_source = CASE
    WHEN COALESCE(visit.user_agent, '') ~* 'bot|crawler|spider|slurp|facebookexternalhit|kakaotalk-scrap|naverbot|googlebot'
      THEN 'bot-user-agent'
    WHEN COALESCE(visit.user_agent, '') ~* 'headlesschrome|playwright|puppeteer|selenium|phantomjs|webdriver|codex|chatgpt|openai'
      THEN 'automation-user-agent'
    ELSE NULL
  END
WHERE visit.user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_site_visit_logs_actor_created
  ON site_visit_logs(actor_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_visit_logs_automated_created
  ON site_visit_logs(is_automated, created_at DESC)
  WHERE is_automated = true;
