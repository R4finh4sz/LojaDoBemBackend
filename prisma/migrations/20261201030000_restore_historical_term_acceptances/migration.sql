-- Earlier publications marked genuine prior acceptances as false.
UPDATE "term_accepts"
SET "accepted" = true
WHERE "accepted" = false;
