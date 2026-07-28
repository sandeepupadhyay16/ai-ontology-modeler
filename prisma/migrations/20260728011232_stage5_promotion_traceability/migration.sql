-- AlterTable
ALTER TABLE "CandidateConcept" ADD COLUMN     "changeSetId" TEXT,
ADD COLUMN     "promotedConceptId" TEXT,
ADD COLUMN     "promotedRelationshipId" TEXT;

-- AddForeignKey
ALTER TABLE "CandidateConcept" ADD CONSTRAINT "CandidateConcept_changeSetId_fkey" FOREIGN KEY ("changeSetId") REFERENCES "ChangeSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateConcept" ADD CONSTRAINT "CandidateConcept_promotedConceptId_fkey" FOREIGN KEY ("promotedConceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateConcept" ADD CONSTRAINT "CandidateConcept_promotedRelationshipId_fkey" FOREIGN KEY ("promotedRelationshipId") REFERENCES "Relationship"("id") ON DELETE SET NULL ON UPDATE CASCADE;
