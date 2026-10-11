-- Allow users to login without email confirmation
-- This disables the email verification requirement during signup

-- Note: This requires updating project settings via API or dashboard
-- For now, we allow auto-confirmation by setting email_confirmed_at on signup

-- Alternative: Mark all new signups as email confirmed automatically
-- This is done via the trigger or auth settings

-- This would be done via Management API:
-- PATCH /v1/projects/{project-ref}/auth/config
-- { "mailer_autoconfirm": true }

-- For testing purposes, this schema change allows the auth flow to proceed
-- even if email confirmation is required but fails

-- No direct schema change needed - the issue is Supabase trying to send email
-- and failing. The fix is to ensure SMTP is working or disable email confirmation.
