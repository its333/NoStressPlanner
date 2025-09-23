-- DropIndex
DROP INDEX "public"."AttendeeSession_eventId_userId_isActive_key";

-- CreateIndex
CREATE INDEX "AttendeeSession_sessionKey_idx" ON "public"."AttendeeSession"("sessionKey");
