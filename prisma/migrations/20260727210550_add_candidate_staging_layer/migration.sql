-- CreateTable
CREATE TABLE "ModelingSession" (
    "id" TEXT NOT NULL,
    "ontologyId" TEXT NOT NULL,
    "domainProfile" TEXT,
    "participant" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationTurn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateConcept" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sourceTurnId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "candidateType" TEXT NOT NULL,
    "upperOntologyTag" TEXT,
    "dupStatus" TEXT NOT NULL DEFAULT 'UNCHECKED',
    "dupTargetConceptId" TEXT,
    "similarityScore" DOUBLE PRECISION,
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "mergeTargetConceptId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateConcept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeSet" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "ttlDiff" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlossaryDraft" (
    "id" TEXT NOT NULL,
    "changeSetId" TEXT NOT NULL,
    "linkedConceptId" TEXT,
    "linkedRelationshipId" TEXT,
    "term" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "sourceTurnId" TEXT NOT NULL,
    "confirmationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlossaryDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleDraft" (
    "id" TEXT NOT NULL,
    "changeSetId" TEXT NOT NULL,
    "linkedPropertyId" TEXT,
    "linkedPropertyType" TEXT,
    "condition" JSONB NOT NULL,
    "derivedValue" JSONB NOT NULL,
    "sourceTurnId" TEXT NOT NULL,
    "confirmationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OntologyVersion" (
    "id" TEXT NOT NULL,
    "ontologyId" TEXT NOT NULL,
    "changeSetId" TEXT NOT NULL,
    "gitCommitSha" TEXT,
    "changelog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OntologyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signoff" (
    "id" TEXT NOT NULL,
    "changeSetId" TEXT NOT NULL,
    "approverRole" TEXT NOT NULL,
    "approver" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comments" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationTurn_sessionId_ordinal_key" ON "ConversationTurn"("sessionId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "OntologyVersion_changeSetId_key" ON "OntologyVersion"("changeSetId");

-- AddForeignKey
ALTER TABLE "ModelingSession" ADD CONSTRAINT "ModelingSession_ontologyId_fkey" FOREIGN KEY ("ontologyId") REFERENCES "Ontology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationTurn" ADD CONSTRAINT "ConversationTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ModelingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateConcept" ADD CONSTRAINT "CandidateConcept_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ModelingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateConcept" ADD CONSTRAINT "CandidateConcept_sourceTurnId_fkey" FOREIGN KEY ("sourceTurnId") REFERENCES "ConversationTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateConcept" ADD CONSTRAINT "CandidateConcept_dupTargetConceptId_fkey" FOREIGN KEY ("dupTargetConceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateConcept" ADD CONSTRAINT "CandidateConcept_mergeTargetConceptId_fkey" FOREIGN KEY ("mergeTargetConceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeSet" ADD CONSTRAINT "ChangeSet_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ModelingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlossaryDraft" ADD CONSTRAINT "GlossaryDraft_changeSetId_fkey" FOREIGN KEY ("changeSetId") REFERENCES "ChangeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlossaryDraft" ADD CONSTRAINT "GlossaryDraft_linkedConceptId_fkey" FOREIGN KEY ("linkedConceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlossaryDraft" ADD CONSTRAINT "GlossaryDraft_linkedRelationshipId_fkey" FOREIGN KEY ("linkedRelationshipId") REFERENCES "Relationship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlossaryDraft" ADD CONSTRAINT "GlossaryDraft_sourceTurnId_fkey" FOREIGN KEY ("sourceTurnId") REFERENCES "ConversationTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleDraft" ADD CONSTRAINT "RuleDraft_changeSetId_fkey" FOREIGN KEY ("changeSetId") REFERENCES "ChangeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleDraft" ADD CONSTRAINT "RuleDraft_sourceTurnId_fkey" FOREIGN KEY ("sourceTurnId") REFERENCES "ConversationTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OntologyVersion" ADD CONSTRAINT "OntologyVersion_ontologyId_fkey" FOREIGN KEY ("ontologyId") REFERENCES "Ontology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OntologyVersion" ADD CONSTRAINT "OntologyVersion_changeSetId_fkey" FOREIGN KEY ("changeSetId") REFERENCES "ChangeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signoff" ADD CONSTRAINT "Signoff_changeSetId_fkey" FOREIGN KEY ("changeSetId") REFERENCES "ChangeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
