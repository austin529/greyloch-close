-- Re-key users to their Microsoft Entra identities. The team logs in via Entra
-- (Microsoft 365), which sends @greylochllc.onmicrosoft.com addresses — the
-- original @greyloch.com (Google) addresses would never match the Access JWT.
-- Updating in place keeps user ids (and all task assignments) intact.
-- Idempotent: on a fresh DB seeded by 0002 these WHERE clauses match nothing.
UPDATE users SET email = 'austin@greylochllc.onmicrosoft.com'                       WHERE email = 'austin@greyloch.com';
UPDATE users SET email = 'christina@greylochllc.onmicrosoft.com'                    WHERE email = 'christina@greyloch.com';
UPDATE users SET email = 'sydney@greylochllc.onmicrosoft.com'                       WHERE email = 'sydney@greyloch.com';
UPDATE users SET email = 'sharon@greylochllc.onmicrosoft.com', name = 'Sharon Urrutia' WHERE email = 'sharon@greyloch.com';
