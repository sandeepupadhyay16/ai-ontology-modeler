-- AlterTable
ALTER TABLE "Attribute" ADD COLUMN     "addedInChangeSetId" TEXT;

-- AlterTable
ALTER TABLE "ChangeSet" ADD COLUMN     "diffSummary" TEXT,
ADD COLUMN     "ttlFiles" JSONB;

-- AddForeignKey
ALTER TABLE "Attribute" ADD CONSTRAINT "Attribute_addedInChangeSetId_fkey" FOREIGN KEY ("addedInChangeSetId") REFERENCES "ChangeSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
