-- AlterTable
ALTER TABLE "CandidateConcept" ADD COLUMN     "parentConceptId" TEXT;

-- AddForeignKey
ALTER TABLE "CandidateConcept" ADD CONSTRAINT "CandidateConcept_parentConceptId_fkey" FOREIGN KEY ("parentConceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;
