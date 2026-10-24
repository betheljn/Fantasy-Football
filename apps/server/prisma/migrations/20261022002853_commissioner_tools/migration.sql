-- AlterTable
ALTER TABLE "League" ADD COLUMN     "paused" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "away" BOOLEAN NOT NULL DEFAULT false;
