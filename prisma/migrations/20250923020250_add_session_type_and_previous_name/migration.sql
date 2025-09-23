-- AlterTable
ALTER TABLE "public"."AttendeeSession" ADD COLUMN     "previousNameId" TEXT,
ADD COLUMN     "sessionType" TEXT NOT NULL DEFAULT 'anonymous';

-- CreateIndex
CREATE INDEX "AttendeeSession_sessionType_isActive_idx" ON "public"."AttendeeSession"("sessionType", "isActive");
