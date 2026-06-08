ALTER TABLE "Car" ADD COLUMN "chassisCode" TEXT;
ALTER TABLE "Car" ADD COLUMN "engine" TEXT;

UPDATE "Car"
SET "body" = NULL
WHERE "body" = '';

CREATE INDEX "Car_chassisCode_idx" ON "Car"("chassisCode");

CREATE UNIQUE INDEX "Car_make_chassisCode_model_body_engine_key"
ON "Car"("make", "chassisCode", "model", "body", "engine");
