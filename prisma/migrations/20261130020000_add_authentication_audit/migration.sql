ALTER TYPE "SecurityEventKind" ADD VALUE 'LOGIN_SUCCESS';
ALTER TYPE "SecurityEventKind" ADD VALUE 'LOGIN_FAILURE';
ALTER TYPE "SecurityEventKind" ADD VALUE 'TWO_FACTOR_REQUIRED';
ALTER TYPE "SecurityEventKind" ADD VALUE 'TWO_FACTOR_SUCCESS';
ALTER TYPE "SecurityEventKind" ADD VALUE 'TWO_FACTOR_FAILURE';

ALTER TABLE "security_events" ALTER COLUMN "blockedUntil" DROP NOT NULL;

CREATE FUNCTION reject_security_event_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'security_events accepts inserts only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER security_events_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON "security_events"
FOR EACH STATEMENT EXECUTE FUNCTION reject_security_event_mutation();
