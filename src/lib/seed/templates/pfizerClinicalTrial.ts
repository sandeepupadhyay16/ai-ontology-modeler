import type { SeedSource } from '@/lib/seed/types';

/**
 * Curated starter map for Pfizer — Clinical Trial / Drug Development: an investigational compound
 * evaluated in a protocol-governed trial across sites and subjects, measured against endpoints and
 * supporting a regulatory submission. Standards-aligned, deterministic seed (docs/V3_FLOW.md §3);
 * general names borrowed from Pistoia PGO (CC BY 4.0) and CDISC-style trial vocabulary. 5-type model.
 */
export const pfizerClinicalTrialSeed: SeedSource = {
  classes: [
    { label: 'Compound', conceptType: 'Entity', upperOntologyTag: 'Entity', description: 'The investigational drug candidate under study.', attributes: [{ name: 'compoundCode', datatype: 'string', description: 'Internal candidate code.' }, { name: 'modality', datatype: 'string', description: 'Small molecule, biologic, mRNA, etc.' }] },
    { label: 'Indication', conceptType: 'Entity', upperOntologyTag: 'Entity', description: 'The target disease or condition.' },
    { label: 'ClinicalTrial', conceptType: 'Entity', upperOntologyTag: 'Entity', description: 'The clinical study evaluating the compound.', attributes: [{ name: 'phase', datatype: 'string', description: 'Trial phase (I–IV).' }, { name: 'nctId', datatype: 'string', description: 'Registry identifier.' }] },
    { label: 'Protocol', conceptType: 'Entity', upperOntologyTag: 'Entity', description: 'The protocol governing trial conduct.' },
    { label: 'Endpoint', conceptType: 'Entity', upperOntologyTag: 'Entity', description: 'A pre-specified efficacy or safety endpoint.' },
    { label: 'RegulatorySubmission', conceptType: 'Entity', upperOntologyTag: 'Entity', description: 'An NDA/BLA submission built from trial evidence.' },
    { label: 'StudySite', conceptType: 'Agent', upperOntologyTag: 'Agent', description: 'A site where the trial is conducted.' },
    { label: 'Investigator', conceptType: 'Agent', upperOntologyTag: 'Agent', description: 'The principal investigator running a site.' },
    { label: 'Subject', conceptType: 'Agent', upperOntologyTag: 'Agent', description: 'An enrolled trial participant.', attributes: [{ name: 'subjectId', datatype: 'string', description: 'De-identified subject id.' }, { name: 'arm', datatype: 'string', description: 'Treatment arm.' }] },
    { label: 'Sponsor', conceptType: 'Agent', upperOntologyTag: 'Agent', description: 'The trial sponsor (Pfizer).' },
    { label: 'Regulator', conceptType: 'Agent', upperOntologyTag: 'Agent', description: 'The authority reviewing the submission (FDA/EMA).' },
    { label: 'Enrollment', conceptType: 'Process', upperOntologyTag: 'Process', description: 'The recruitment and enrollment workflow.' },
    { label: 'Randomization', conceptType: 'Process', upperOntologyTag: 'Process', description: 'Assignment of subjects to treatment arms.' },
    { label: 'SubjectVisit', conceptType: 'Event', upperOntologyTag: 'Event', description: 'A scheduled study visit for a subject.', attributes: [{ name: 'visitDate', datatype: 'string', description: 'Date of the visit.' }] },
    { label: 'AdverseEvent', conceptType: 'Event', upperOntologyTag: 'Event', description: 'An adverse event reported during the trial.', attributes: [{ name: 'grade', datatype: 'integer', description: 'Severity grade.' }, { name: 'serious', datatype: 'boolean', description: 'Whether it is a serious AE.' }] },
    { label: 'EnrollmentRate', conceptType: 'Metric', upperOntologyTag: 'Quality', description: 'Subjects enrolled per site per unit time.', attributes: [{ name: 'perSitePerMonth', datatype: 'float', description: 'Enrollment velocity.' }] },
  ],
  relationships: [
    { name: 'targets', source: 'Compound', target: 'Indication', upperOntologyTag: 'Relation', description: 'A compound targets an indication.' },
    { name: 'evaluates', source: 'ClinicalTrial', target: 'Compound', upperOntologyTag: 'Relation', description: 'A trial evaluates a compound.' },
    { name: 'governedBy', source: 'ClinicalTrial', target: 'Protocol', upperOntologyTag: 'Relation', description: 'A trial is governed by a protocol.' },
    { name: 'conductedAt', source: 'ClinicalTrial', target: 'StudySite', upperOntologyTag: 'Relation', cardinality: 'one-to-many', description: 'A trial is conducted at study sites.' },
    { name: 'ledBy', source: 'StudySite', target: 'Investigator', upperOntologyTag: 'Relation', description: 'A site is led by an investigator.' },
    { name: 'sponsors', source: 'Sponsor', target: 'ClinicalTrial', upperOntologyTag: 'Relation', description: 'A sponsor sponsors the trial.' },
    { name: 'enrolls', source: 'Enrollment', target: 'Subject', upperOntologyTag: 'Relation', cardinality: 'one-to-many', description: 'Enrollment brings in subjects.' },
    { name: 'assigns', source: 'Randomization', target: 'Subject', upperOntologyTag: 'Relation', cardinality: 'one-to-many', description: 'Randomization assigns subjects to arms.' },
    { name: 'measures', source: 'ClinicalTrial', target: 'Endpoint', upperOntologyTag: 'Relation', cardinality: 'one-to-many', description: 'A trial measures endpoints.' },
    { name: 'attends', source: 'Subject', target: 'SubjectVisit', upperOntologyTag: 'Relation', cardinality: 'one-to-many', description: 'A subject attends study visits.' },
    { name: 'reports', source: 'Subject', target: 'AdverseEvent', upperOntologyTag: 'Relation', cardinality: 'one-to-many', description: 'A subject reports adverse events.' },
    { name: 'supports', source: 'ClinicalTrial', target: 'RegulatorySubmission', upperOntologyTag: 'Relation', description: 'A trial supports a regulatory submission.' },
    { name: 'submittedTo', source: 'RegulatorySubmission', target: 'Regulator', upperOntologyTag: 'Relation', description: 'A submission is filed to a regulator.' },
    { name: 'measuredBy', source: 'ClinicalTrial', target: 'EnrollmentRate', upperOntologyTag: 'Relation', description: 'Recruitment is measured by enrollment rate.' },
  ],
};
