/**
 * Extensible Domain Taxonomy Registry
 * 
 * Data-driven registry of industry-specific domain taxonomies used to inject
 * domain-anchored guidance into LLM prompts. This replaces hardcoded substring
 * checks with a structured, extensible lookup.
 */

export interface DomainTaxonomy {
  id: string;
  name: string;
  keywords: string[];  // trigger words for detection (all lowercase)
  personas: string[];
  processes: string[];
  entities: string[];
  systems: string[];
  metrics: string[];
  events: string[];
  sampleCQs: string[];
}

const DOMAIN_TAXONOMIES: DomainTaxonomy[] = [
  {
    id: 'cart-cell-therapy',
    name: 'CAR-T / Cell Therapy',
    keywords: ['car-t', 'cart', 'cell therapy', 'leukapheresis', 'vein-to-vein', 'autologous', 'apheresis'],
    personas: ['CellTherapyCoordinator', 'LeukapheresisSpecialist', 'QualityControlAuditor', 'InfusionNurse', 'ApheresisCoordinator'],
    processes: ['PatientSlotScheduling', 'LeukapheresisCollection', 'CryopreservationTransit', 'CellTransductionAndExpansion', 'BatchReleaseTesting', 'PatientInfusion'],
    entities: ['PatientProfile', 'LeukapheresisSample', 'CryoVialBatch', 'InfusionKit', 'MedicalTreatmentCenter', 'ViralVectorLot'],
    systems: ['ChainOfCustodyPlatform', 'BatchManufacturingSystem', 'UltraColdLogisticsTracker'],
    metrics: ['VeintoVeinCycleTime', 'CellViabilityRate', 'CryoTempDelta', 'BatchSuccessRate'],
    events: ['CryoTemperatureSpikeEvent', 'BatchReleaseApproval', 'InfusionScheduleConfirmation'],
    sampleCQs: [
      'What is the average vein-to-vein turnaround time per treatment center?',
      'Which cryo transport containers logged temperature spikes above -150C in transit?',
      'What is the batch success rate for CAR-T expansion processes across manufacturing suites?',
    ],
  },
  {
    id: 'pharma-commercial',
    name: 'Pharmaceutical Commercial & Medical Operations',
    keywords: ['pharma', 'drug', 'prescription', 'prescriber', 'physician', 'biotech', 'clinical', 'detailing', 'formulary', 'medical affairs'],
    personas: ['SalesRepresentative', 'MedicalScienceLiaison', 'TargetPhysician', 'KeyOpinionLeader', 'DistrictSalesManager'],
    processes: ['PhysicianDetailingVisit', 'SampleDistribution', 'SpeakerProgramExecution', 'PrescriptionFulfillment', 'FormularyReviewProcess'],
    entities: ['TargetPrescriber', 'PrescriptionOrder', 'PharmaceuticalProduct', 'ClinicalStudyRecord', 'TerritoryPlan'],
    systems: ['PharmaCRMPlatform', 'ERPOrderSystem', 'PrescriptionDataWarehouse', 'SampleTrackingSystem'],
    metrics: ['PrescriptionConversionRate', 'DetailingAdherenceScore', 'TerritoryRevenue', 'PhysicianAwarenessScore'],
    events: ['FormularyDecisionEvent', 'ProductLaunchMilestone', 'ComplianceAuditTrigger'],
    sampleCQs: [
      'Which sales representatives have the highest prescription conversion rate this quarter?',
      'What is the average detailing adherence score across territories?',
      'Which physicians have been targeted for speaker programs but not yet engaged?',
    ],
  },
  {
    id: 'rwe-heor',
    name: 'Real World Evidence & Health Economics',
    keywords: ['rwd', 'real world', 'evidence', 'heor', 'registry', 'observational', 'ehr', 'fhir'],
    personas: ['PrincipalInvestigator', 'DataGovernanceAuditor', 'ClinicalDataManager', 'StudyDirector'],
    processes: ['RegistryOnboardingProcess', 'DataExtractionProcess', 'PatientConsentVerification', 'StudyProtocolDrafting', 'HEORAnalysisProcess'],
    entities: ['PatientRegistry', 'ObservationalStudyProtocol', 'PatientConsentRecord', 'BiomarkerDataset', 'ValueDossier'],
    systems: ['EHRDataPipeline', 'FHIRDataGateway', 'ClinicalDataLake'],
    metrics: ['DataIngestionLatency', 'PatientEnrollmentCount', 'DataIntegrityScore', 'OverallSurvivalRate'],
    events: ['DataLockMilestone', 'IRBApprovalEvent', 'AdverseEventReport'],
    sampleCQs: [
      'What is the real-time data ingestion latency across FHIR EHR pipelines?',
      'What percentage of enrolled registry patients have logged consent protocols?',
      'Which principal investigators have onboarded over 500 cohort patients this quarter?',
    ],
  },
  {
    id: 'supply-chain',
    name: 'Supply Chain & Logistics',
    keywords: ['supply chain', 'logistics', 'inventory', 'warehouse', 'shipment', 'freight', 'distribution', 'procurement'],
    personas: ['LogisticsCoordinator', 'WarehouseManager', 'CarrierOperator', 'ProcurementOfficer', 'QualityInspector'],
    processes: ['OrderFulfillment', 'InventoryReplenishment', 'FreightRouting', 'QualityInspection', 'SupplierOnboarding'],
    entities: ['PurchaseOrder', 'ShipmentContainer', 'InventoryPallet', 'DistributionFacility', 'SupplierContract'],
    systems: ['WarehouseManagementSystem', 'FleetTelematicsPlatform', 'ERPSystem', 'TransportManagementSystem'],
    metrics: ['OnTimeInFullRate', 'OrderCycleTimeHours', 'InventoryTurnoverRatio', 'DefectRate'],
    events: ['ShipmentDelayAlert', 'StockoutEvent', 'QualityHoldNotification'],
    sampleCQs: [
      'What is the on-time in-full delivery rate across distribution facilities?',
      'Which warehouse locations have inventory turnover ratios below target?',
      'What are the top 5 carrier routes with the highest freight damage rates?',
    ],
  },
  {
    id: 'finance-compliance',
    name: 'Banking & Financial Crime Compliance',
    keywords: ['finance', 'banking', 'aml', 'transaction', 'fraud', 'kyc', 'compliance', 'sanctions', 'money laundering'],
    personas: ['ComplianceOfficer', 'RiskAnalyst', 'RelationshipManager', 'AccountHolder', 'InvestigationsAnalyst'],
    processes: ['CustomerOnboardingKYC', 'TransactionMonitoring', 'SuspiciousActivityReporting', 'SanctionsScreening', 'CaseInvestigation'],
    entities: ['BankAccount', 'FinancialTransaction', 'SuspiciousActivityReport', 'RiskProfileRecord', 'CustomerDossier'],
    systems: ['CoreBankingPlatform', 'AMLEngine', 'SanctionsWatchlistDatabase', 'CaseManagementSystem'],
    metrics: ['FalsePositiveRate', 'SARFilingLatencyHours', 'HighRiskExposureRatio', 'CaseClosureVelocity'],
    events: ['SanctionsAlertTrigger', 'ThresholdBreachEvent', 'RegulatoryFilingDeadline'],
    sampleCQs: [
      'What is the false positive rate for AML transaction monitoring alerts?',
      'What is the average SAR filing latency in hours across investigation teams?',
      'Which high-risk accounts have not been reviewed in the past 90 days?',
    ],
  },
  {
    id: 'healthcare-payer',
    name: 'Healthcare Payer & Insurance',
    keywords: ['payer', 'insurance', 'claims', 'health plan', 'beneficiary', 'prior authorization', 'adjudication', 'hmo', 'ppo'],
    personas: ['ClaimsAdjudicator', 'CareCoordinator', 'MemberServicesAgent', 'MedicalDirector', 'NetworkContractingSpecialist'],
    processes: ['ClaimsAdjudication', 'PriorAuthorizationReview', 'MemberEnrollment', 'ProviderCredentialing', 'UtilizationReview'],
    entities: ['InsuranceClaim', 'Beneficiary', 'ProviderNetwork', 'BenefitPlan', 'AuthorizationRequest'],
    systems: ['ClaimsProcessingPlatform', 'MemberPortal', 'ProviderDirectorySystem', 'PharmacyBenefitManager'],
    metrics: ['ClaimsDenialRate', 'AverageDaysToAdjudication', 'MemberRetentionRate', 'NetworkAdequacyScore'],
    events: ['ClaimDenialAppeal', 'OpenEnrollmentWindow', 'ProviderTerminationNotice'],
    sampleCQs: [
      'What is the average claims adjudication turnaround time by claim type?',
      'Which provider specialties have the highest prior authorization denial rates?',
      'What is the member retention rate across health plan tiers?',
    ],
  },
  {
    id: 'manufacturing',
    name: 'Manufacturing & Production',
    keywords: ['manufacturing', 'production', 'assembly', 'factory', 'quality control', 'lean', 'oee', 'shop floor'],
    personas: ['ProductionSupervisor', 'QualityEngineer', 'MaintenanceTechnician', 'PlantManager', 'ProcessEngineer'],
    processes: ['ProductionScheduling', 'QualityControlInspection', 'PreventiveMaintenance', 'MaterialRequirementsPlanning', 'AssemblyLineExecution'],
    entities: ['WorkOrder', 'BillOfMaterials', 'ProductionBatch', 'InspectionRecord', 'Equipment'],
    systems: ['ManufacturingExecutionSystem', 'SCADASystem', 'ERP', 'CMMSPlatform'],
    metrics: ['OverallEquipmentEffectiveness', 'FirstPassYield', 'MeanTimeBetweenFailures', 'ScrapRate'],
    events: ['EquipmentFailureAlert', 'QualityHold', 'ProductionMilestone'],
    sampleCQs: [
      'What is the overall equipment effectiveness across production lines?',
      'Which assembly stations have the highest scrap rates this quarter?',
      'What is the mean time between failures for critical equipment?',
    ],
  },
  {
    id: 'retail-ecommerce',
    name: 'Retail & E-Commerce',
    keywords: ['retail', 'ecommerce', 'e-commerce', 'store', 'customer', 'merchandise', 'omnichannel', 'pos', 'shopping cart'],
    personas: ['StoreManager', 'MerchandisingAnalyst', 'CustomerServiceAgent', 'EcommerceManager', 'CategoryManager'],
    processes: ['OrderProcessing', 'MerchandisePlanning', 'CustomerReturnHandling', 'PromotionExecution', 'InventoryAllocation'],
    entities: ['CustomerOrder', 'ProductSKU', 'RetailStore', 'ShoppingCart', 'PromotionCampaign'],
    systems: ['PointOfSalePlatform', 'EcommercePlatform', 'CustomerDataPlatform', 'InventoryManagementSystem'],
    metrics: ['ConversionRate', 'AverageOrderValue', 'CustomerLifetimeValue', 'CartAbandonmentRate'],
    events: ['CartAbandonmentEvent', 'FlashSaleTrigger', 'InventoryRestockAlert'],
    sampleCQs: [
      'What is the average order value across online vs in-store channels?',
      'Which product categories have the highest cart abandonment rates?',
      'What is the customer lifetime value by acquisition channel?',
    ],
  },
];

/**
 * Detect matching domain taxonomies from a context string.
 * Returns all matching taxonomies sorted by keyword match count (best first).
 */
export function detectDomainTaxonomies(contextStr: string): DomainTaxonomy[] {
  const lower = contextStr.toLowerCase();
  
  const scored = DOMAIN_TAXONOMIES.map(taxonomy => {
    const matchCount = taxonomy.keywords.filter(kw => lower.includes(kw)).length;
    return { taxonomy, matchCount };
  }).filter(item => item.matchCount > 0);

  scored.sort((a, b) => b.matchCount - a.matchCount);
  return scored.map(item => item.taxonomy);
}

/**
 * Format a domain taxonomy as a prompt guidance block.
 */
export function formatTaxonomyGuidance(taxonomy: DomainTaxonomy): string {
  return `
DOMAIN TAXONOMY STANDARD (${taxonomy.name}):
- Key Personas: ${taxonomy.personas.join(', ')}
- Key Processes: ${taxonomy.processes.join(', ')}
- Key Entities: ${taxonomy.entities.join(', ')}
- Key Systems: ${taxonomy.systems.join(', ')}
- Key Metrics: ${taxonomy.metrics.join(', ')}
- Key Events: ${taxonomy.events.join(', ')}`;
}

/**
 * Get all registered domain taxonomy IDs and names.
 */
export function listDomainTaxonomies(): Array<{ id: string; name: string }> {
  return DOMAIN_TAXONOMIES.map(t => ({ id: t.id, name: t.name }));
}
