/*
  Warnings:

  - You are about to drop the column `linkedPropertyId` on the `RuleDraft` table. All the data in the column will be lost.
  - You are about to drop the column `linkedPropertyType` on the `RuleDraft` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "RuleDraft" DROP COLUMN "linkedPropertyId",
DROP COLUMN "linkedPropertyType",
ADD COLUMN     "clarifyingQuestion" TEXT,
ADD COLUMN     "linkedAttributeId" TEXT,
ADD COLUMN     "linkedRelationshipId" TEXT;

-- AddForeignKey
ALTER TABLE "RuleDraft" ADD CONSTRAINT "RuleDraft_linkedAttributeId_fkey" FOREIGN KEY ("linkedAttributeId") REFERENCES "Attribute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleDraft" ADD CONSTRAINT "RuleDraft_linkedRelationshipId_fkey" FOREIGN KEY ("linkedRelationshipId") REFERENCES "Relationship"("id") ON DELETE SET NULL ON UPDATE CASCADE;
