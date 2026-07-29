import type { SeedSource } from '@/lib/seed/types';

/**
 * Curated starter map for Financial Services × Risk Management.
 *
 * Class names and IRIs are BORROWED from FIBO (the EDM Council Financial Industry
 * Business Ontology) rather than parsed from it — the standards-aligned, deterministic
 * seed of docs/V3_FLOW.md §3. FIBO IRIs are alignment hints; they are not fetched. Live
 * FIBO ingestion is the deferred `fromStandardVocab` loader.
 */
const FIBO = 'https://spec.edmcouncil.org/fibo/ontology';

export const financialServicesRiskSeed: SeedSource = {
  classes: [
    {
      label: 'Account',
      conceptType: 'Entity',
      upperOntologyTag: 'Entity',
      description: 'A financial account holding positions or balances.',
      uri: `${FIBO}/FBC/ProductsAndServices/FinancialProductsAndServices/Account`,
      attributes: [
        { name: 'accountNumber', datatype: 'string', description: 'Account identifier.' },
        { name: 'balance', datatype: 'float', description: 'Current balance.' },
      ],
    },
    {
      label: 'Counterparty',
      conceptType: 'Agent',
      upperOntologyTag: 'Agent',
      description: 'A party to a financial transaction or agreement.',
      uri: `${FIBO}/FND/AgentsAndPeople/Agents/Agent`,
      attributes: [
        { name: 'legalName', datatype: 'string', description: 'Registered legal name.' },
        { name: 'lei', datatype: 'string', description: 'Legal Entity Identifier.' },
      ],
    },
    {
      label: 'FinancialInstrument',
      conceptType: 'Entity',
      upperOntologyTag: 'Entity',
      description: 'A tradable financial instrument (security, derivative, loan).',
      uri: `${FIBO}/FBC/FinancialInstruments/FinancialInstruments/FinancialInstrument`,
      attributes: [
        { name: 'isin', datatype: 'string', description: 'International Securities Identification Number.' },
        { name: 'instrumentType', datatype: 'string', description: 'Kind of instrument.' },
      ],
    },
    {
      label: 'Portfolio',
      conceptType: 'Entity',
      upperOntologyTag: 'Entity',
      description: 'A managed collection of financial instruments and positions.',
      uri: `${FIBO}/FBC/ProductsAndServices/ClientsAndAccounts/Portfolio`,
    },
    {
      label: 'Transaction',
      conceptType: 'Entity',
      upperOntologyTag: 'Event',
      description: 'A financial transaction executed between counterparties.',
      uri: `${FIBO}/FBC/FunctionalEntities/Payments/Transaction`,
      attributes: [
        { name: 'amount', datatype: 'float', description: 'Transaction amount.' },
        { name: 'tradeDate', datatype: 'string', description: 'Date the transaction was executed.' },
      ],
    },
    {
      label: 'RiskExposure',
      conceptType: 'Metric',
      upperOntologyTag: 'Quality',
      description: 'A measurable risk exposure attributable to a portfolio or counterparty.',
      attributes: [
        { name: 'exposureType', datatype: 'string', description: 'Market, credit, liquidity, operational, etc.' },
        { name: 'exposureValue', datatype: 'float', description: 'Quantified exposure.' },
      ],
    },
    {
      label: 'Regulator',
      conceptType: 'Agent',
      upperOntologyTag: 'Agent',
      description: 'A regulatory authority overseeing financial activity.',
      uri: `${FIBO}/FND/GoalsAndObjectives/Objectives/Regulator`,
    },
  ],
  relationships: [
    { name: 'heldBy', source: 'Account', target: 'Counterparty', upperOntologyTag: 'Relation', description: 'An account is held by a counterparty.' },
    { name: 'holds', source: 'Portfolio', target: 'FinancialInstrument', upperOntologyTag: 'Relation', cardinality: 'one-to-many', description: 'A portfolio holds financial instruments.' },
    { name: 'exposedTo', source: 'Portfolio', target: 'RiskExposure', upperOntologyTag: 'Relation', cardinality: 'one-to-many', description: 'A portfolio is exposed to risk.' },
    { name: 'executes', source: 'Counterparty', target: 'Transaction', upperOntologyTag: 'Relation', cardinality: 'one-to-many', description: 'A counterparty executes transactions.' },
    { name: 'settledIn', source: 'Transaction', target: 'Account', upperOntologyTag: 'Relation', description: 'A transaction settles in an account.' },
    { name: 'regulates', source: 'Regulator', target: 'Counterparty', upperOntologyTag: 'Relation', cardinality: 'many-to-many', description: 'A regulator regulates counterparties.' },
  ],
};
