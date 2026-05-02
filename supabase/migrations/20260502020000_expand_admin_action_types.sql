ALTER TABLE admin_actions
  DROP CONSTRAINT IF EXISTS admin_actions_target_type_check;

ALTER TABLE admin_actions
  ADD CONSTRAINT admin_actions_target_type_check
  CHECK (target_type IN ('poster','comment','user','report','category','region'));

ALTER TABLE admin_actions
  DROP CONSTRAINT IF EXISTS admin_actions_action_type_check;

ALTER TABLE admin_actions
  ADD CONSTRAINT admin_actions_action_type_check
  CHECK (action_type IN ('create','update','hide','delete','suspend','approve','reject','expire','dismiss'));
