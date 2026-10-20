-- Stable total ordering even when two policy writes share the same millisecond.
ALTER TABLE "pricing_rules" ADD COLUMN "revision" SERIAL NOT NULL;
CREATE UNIQUE INDEX "pricing_rules_revision_key" ON "pricing_rules"("revision");
