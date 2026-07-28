-- AlterTable
ALTER TABLE "CandidateConcept" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'extension:generic';

-- AlterTable
ALTER TABLE "Concept" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "Ontology" ADD COLUMN     "extendsOntologyId" TEXT,
ADD COLUMN     "moduleScope" TEXT NOT NULL DEFAULT 'core';

-- AddForeignKey
ALTER TABLE "Ontology" ADD CONSTRAINT "Ontology_extendsOntologyId_fkey" FOREIGN KEY ("extendsOntologyId") REFERENCES "Ontology"("id") ON DELETE SET NULL ON UPDATE CASCADE;
