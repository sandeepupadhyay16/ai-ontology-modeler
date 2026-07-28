-- AlterTable
ALTER TABLE "Attribute" ADD COLUMN     "uri" TEXT;

-- AlterTable
ALTER TABLE "Concept" ADD COLUMN     "parentConceptId" TEXT,
ADD COLUMN     "uri" TEXT;

-- AlterTable
ALTER TABLE "Constraint" ADD COLUMN     "shaclShape" JSONB;

-- AlterTable
ALTER TABLE "DriverEdge" ADD COLUMN     "polarity" TEXT NOT NULL DEFAULT '+',
ADD COLUMN     "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

-- AlterTable
ALTER TABLE "Ontology" ADD COLUMN     "aiMissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "businessFunction" TEXT,
ADD COLUMN     "businessFunctionId" TEXT,
ADD COLUMN     "businessProcessId" TEXT,
ADD COLUMN     "businessProcessName" TEXT,
ADD COLUMN     "businessSolution" TEXT,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "objective" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "owlAxioms" JSONB,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "businessFunctionId" TEXT;

-- AlterTable
ALTER TABLE "Relationship" ADD COLUMN     "propertyType" TEXT NOT NULL DEFAULT 'ObjectProperty',
ADD COLUMN     "uri" TEXT;

-- CreateTable
CREATE TABLE "Perspective" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "personaId" TEXT,
    "ontologyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Perspective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CausalCycle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cycleType" TEXT NOT NULL DEFAULT 'REINFORCING',
    "description" TEXT,
    "ontologyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CausalCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessFunction" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'CORE',
    "description" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessFunction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessProcess" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "businessFunctionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessSolution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "businessOwnerId" TEXT,
    "itOwnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessSolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessCapability" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "solutionId" TEXT NOT NULL,

    CONSTRAINT "BusinessCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolutionOwner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "team" TEXT,
    "email" TEXT,

    CONSTRAINT "SolutionOwner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolutionLink" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "solutionId" TEXT NOT NULL,

    CONSTRAINT "SolutionLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "System" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "systemType" TEXT NOT NULL DEFAULT 'OPERATIONAL',
    "vendor" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "System_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemLink" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'RUNS',

    CONSTRAINT "SystemLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "connectionRef" TEXT,
    "systemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataMapping" (
    "id" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "columnOrField" TEXT,
    "transformation" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "status" TEXT NOT NULL DEFAULT 'Proposed',

    CONSTRAINT "DataMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContextPack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '0.1.0',
    "ontologyId" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "contents" JSONB NOT NULL,
    "gapAnalysis" JSONB,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContextPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmConfiguration" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT,
    "baseUrl" TEXT,
    "modelName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LlmConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PerspectiveConcepts" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PerspectiveConcepts_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_CycleEdges" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CycleEdges_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_name_key" ON "Organization"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SolutionLink_processId_solutionId_key" ON "SolutionLink"("processId", "solutionId");

-- CreateIndex
CREATE UNIQUE INDEX "System_name_key" ON "System"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SystemLink_processId_systemId_key" ON "SystemLink"("processId", "systemId");

-- CreateIndex
CREATE UNIQUE INDEX "DataMapping_conceptId_dataSourceId_key" ON "DataMapping"("conceptId", "dataSourceId");

-- CreateIndex
CREATE INDEX "_PerspectiveConcepts_B_index" ON "_PerspectiveConcepts"("B");

-- CreateIndex
CREATE INDEX "_CycleEdges_B_index" ON "_CycleEdges"("B");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_businessFunctionId_fkey" FOREIGN KEY ("businessFunctionId") REFERENCES "BusinessFunction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ontology" ADD CONSTRAINT "Ontology_businessProcessId_fkey" FOREIGN KEY ("businessProcessId") REFERENCES "BusinessProcess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ontology" ADD CONSTRAINT "Ontology_businessFunctionId_fkey" FOREIGN KEY ("businessFunctionId") REFERENCES "BusinessFunction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ontology" ADD CONSTRAINT "Ontology_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_parentConceptId_fkey" FOREIGN KEY ("parentConceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Perspective" ADD CONSTRAINT "Perspective_ontologyId_fkey" FOREIGN KEY ("ontologyId") REFERENCES "Ontology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Perspective" ADD CONSTRAINT "Perspective_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CausalCycle" ADD CONSTRAINT "CausalCycle_ontologyId_fkey" FOREIGN KEY ("ontologyId") REFERENCES "Ontology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessFunction" ADD CONSTRAINT "BusinessFunction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessProcess" ADD CONSTRAINT "BusinessProcess_businessFunctionId_fkey" FOREIGN KEY ("businessFunctionId") REFERENCES "BusinessFunction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessProcess" ADD CONSTRAINT "BusinessProcess_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "BusinessProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSolution" ADD CONSTRAINT "BusinessSolution_businessOwnerId_fkey" FOREIGN KEY ("businessOwnerId") REFERENCES "SolutionOwner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSolution" ADD CONSTRAINT "BusinessSolution_itOwnerId_fkey" FOREIGN KEY ("itOwnerId") REFERENCES "SolutionOwner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessCapability" ADD CONSTRAINT "BusinessCapability_solutionId_fkey" FOREIGN KEY ("solutionId") REFERENCES "BusinessSolution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolutionLink" ADD CONSTRAINT "SolutionLink_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BusinessProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolutionLink" ADD CONSTRAINT "SolutionLink_solutionId_fkey" FOREIGN KEY ("solutionId") REFERENCES "BusinessSolution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemLink" ADD CONSTRAINT "SystemLink_processId_fkey" FOREIGN KEY ("processId") REFERENCES "BusinessProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemLink" ADD CONSTRAINT "SystemLink_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "System"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "System"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataMapping" ADD CONSTRAINT "DataMapping_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataMapping" ADD CONSTRAINT "DataMapping_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextPack" ADD CONSTRAINT "ContextPack_ontologyId_fkey" FOREIGN KEY ("ontologyId") REFERENCES "Ontology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PerspectiveConcepts" ADD CONSTRAINT "_PerspectiveConcepts_A_fkey" FOREIGN KEY ("A") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PerspectiveConcepts" ADD CONSTRAINT "_PerspectiveConcepts_B_fkey" FOREIGN KEY ("B") REFERENCES "Perspective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CycleEdges" ADD CONSTRAINT "_CycleEdges_A_fkey" FOREIGN KEY ("A") REFERENCES "CausalCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CycleEdges" ADD CONSTRAINT "_CycleEdges_B_fkey" FOREIGN KEY ("B") REFERENCES "DriverEdge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

