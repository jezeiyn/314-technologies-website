-- Run this only AFTER the "register" edge function is deployed, TURNSTILE_SECRET_KEY is set,
-- and js/config.js on the live site has a turnstileSiteKey. From then on, registrations must go
-- through the function, so the browser can no longer call submit_application directly and skip the check.
-- To undo: grant execute on function public.submit_application(jsonb) to anon;
revoke execute on function public.submit_application(jsonb) from anon;
grant execute on function public.submit_application(jsonb) to service_role;
