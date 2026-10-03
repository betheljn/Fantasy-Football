-- AlterTable
ALTER TABLE "League" ADD COLUMN     "deadline" TIMESTAMP(3),
ADD COLUMN     "weekHours" INTEGER NOT NULL DEFAULT 24;
