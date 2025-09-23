/*
  Warnings:

  - The primary key for the `DayBlock` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `attendeeId` on the `DayBlock` table. All the data in the column will be lost.
  - The primary key for the `Vote` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `attendeeId` on the `Vote` table. All the data in the column will be lost.
  - You are about to drop the `Attendee` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `attendeeNameId` to the `DayBlock` table without a default value. This is not possible if the table is not empty.
  - Added the required column `attendeeNameId` to the `Vote` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Attendee" DROP CONSTRAINT "Attendee_attendeeNameId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Attendee" DROP CONSTRAINT "Attendee_eventId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Attendee" DROP CONSTRAINT "Attendee_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."DayBlock" DROP CONSTRAINT "DayBlock_attendeeId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Vote" DROP CONSTRAINT "Vote_attendeeId_fkey";

-- AlterTable
ALTER TABLE "public"."DayBlock" DROP CONSTRAINT "DayBlock_pkey",
DROP COLUMN "attendeeId",
ADD COLUMN     "attendeeNameId" TEXT NOT NULL,
ADD CONSTRAINT "DayBlock_pkey" PRIMARY KEY ("eventId", "attendeeNameId", "date");

-- AlterTable
ALTER TABLE "public"."Vote" DROP CONSTRAINT "Vote_pkey",
DROP COLUMN "attendeeId",
ADD COLUMN     "attendeeNameId" TEXT NOT NULL,
ADD CONSTRAINT "Vote_pkey" PRIMARY KEY ("eventId", "attendeeNameId");

-- DropTable
DROP TABLE "public"."Attendee";

-- CreateTable
CREATE TABLE "public"."AttendeeSession" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "attendeeNameId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "anonymousBlocks" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendeeSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendeeSession_eventId_isActive_idx" ON "public"."AttendeeSession"("eventId", "isActive");

-- CreateIndex
CREATE INDEX "AttendeeSession_userId_isActive_idx" ON "public"."AttendeeSession"("userId", "isActive");

-- CreateIndex
CREATE INDEX "AttendeeSession_attendeeNameId_idx" ON "public"."AttendeeSession"("attendeeNameId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendeeSession_eventId_sessionKey_key" ON "public"."AttendeeSession"("eventId", "sessionKey");

-- CreateIndex
CREATE UNIQUE INDEX "AttendeeSession_eventId_userId_isActive_key" ON "public"."AttendeeSession"("eventId", "userId", "isActive");

-- CreateIndex
CREATE INDEX "DayBlock_eventId_date_idx" ON "public"."DayBlock"("eventId", "date");

-- CreateIndex
CREATE INDEX "DayBlock_attendeeNameId_idx" ON "public"."DayBlock"("attendeeNameId");

-- CreateIndex
CREATE INDEX "Event_phase_idx" ON "public"."Event"("phase");

-- CreateIndex
CREATE INDEX "Event_hostId_idx" ON "public"."Event"("hostId");

-- CreateIndex
CREATE INDEX "Event_createdAt_idx" ON "public"."Event"("createdAt");

-- CreateIndex
CREATE INDEX "Vote_eventId_in_idx" ON "public"."Vote"("eventId", "in");

-- CreateIndex
CREATE INDEX "Vote_attendeeNameId_idx" ON "public"."Vote"("attendeeNameId");

-- AddForeignKey
ALTER TABLE "public"."AttendeeSession" ADD CONSTRAINT "AttendeeSession_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AttendeeSession" ADD CONSTRAINT "AttendeeSession_attendeeNameId_fkey" FOREIGN KEY ("attendeeNameId") REFERENCES "public"."AttendeeName"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AttendeeSession" ADD CONSTRAINT "AttendeeSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Vote" ADD CONSTRAINT "Vote_attendeeNameId_fkey" FOREIGN KEY ("attendeeNameId") REFERENCES "public"."AttendeeName"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DayBlock" ADD CONSTRAINT "DayBlock_attendeeNameId_fkey" FOREIGN KEY ("attendeeNameId") REFERENCES "public"."AttendeeName"("id") ON DELETE CASCADE ON UPDATE CASCADE;
