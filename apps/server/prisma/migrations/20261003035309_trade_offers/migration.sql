-- CreateTable
CREATE TABLE "TradeOffer" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "fromTeam" TEXT NOT NULL,
    "toTeam" TEXT NOT NULL,
    "proposal" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradeOffer_leagueId_status_idx" ON "TradeOffer"("leagueId", "status");

-- AddForeignKey
ALTER TABLE "TradeOffer" ADD CONSTRAINT "TradeOffer_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
