BEGIN;

CREATE UNIQUE INDEX "users_single_master_idx" ON "users" ("role")
WHERE "role" = 'MASTER' AND "deletedAt" IS NULL;

CREATE TABLE "master_identity" (
    "id" INTEGER PRIMARY KEY CHECK ("id" = 1),
    "userId" TEXT NOT NULL
);

INSERT INTO "master_identity" ("id", "userId")
SELECT 1, "id" FROM "users"
WHERE "role" = 'MASTER'
ORDER BY ("deletedAt" IS NULL) DESC, "createdAt" DESC, "id" DESC
LIMIT 1;

CREATE FUNCTION enforce_master_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."role" = 'MASTER' AND NEW."deletedAt" IS NULL THEN
        INSERT INTO "master_identity" ("id", "userId") VALUES (1, NEW."id")
        ON CONFLICT ("id") DO NOTHING;

        IF NOT EXISTS (SELECT 1 FROM "master_identity" WHERE "id" = 1 AND "userId" = NEW."id") THEN
            RAISE EXCEPTION 'A única identidade MASTER já foi definida';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "users_master_identity"
AFTER INSERT OR UPDATE OF "role", "deletedAt", "id" ON "users"
FOR EACH ROW EXECUTE FUNCTION enforce_master_identity();

COMMIT;
