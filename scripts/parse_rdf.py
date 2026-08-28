import sys
import json
import os
from pathlib import Path
from rdflib import Graph, RDF, OWL, RDFS, URIRef

def get_local_name(uri):
    """Extract local name/slug from a URI."""
    uri_str = str(uri)
    if "#" in uri_str:
        return uri_str.split("#")[-1]
    elif "/" in uri_str:
        return uri_str.split("/")[-1]
    return uri_str

def parse_rdf(file_path, fmt=None):
    g = Graph()
    
    # Auto-detect format if not explicitly passed
    if not fmt:
        ext = Path(file_path).suffix.lower()
        if ext in ('.ttl', '.turtle'):
            fmt = 'turtle'
        elif ext in ('.owl', '.rdf', '.xml'):
            fmt = 'xml'
        elif ext in ('.jsonld', '.json'):
            fmt = 'json-ld'
        elif ext == '.nt':
            fmt = 'nt'
        else:
            fmt = 'xml' # Default fallback
            
    g.parse(file_path, format=fmt)

    # 1. Extract Ontology Metadata
    ontology_uri = None
    description = ""
    for s in g.subjects(RDF.type, OWL.Ontology):
        ontology_uri = str(s)
        comment = g.value(s, RDFS.comment)
        if comment:
            description = str(comment)
        break
    
    if not ontology_uri:
        # Fallback to the file's base name as namespace URN
        base_name = Path(file_path).stem
        ontology_uri = f"urn:tse:imported:{base_name}"

    concepts_dict = {}
    relationships = []

    def infer_concept_type(label, slug):
        text = f"{label} {slug}".lower()
        if any(w in text for w in ['process', 'activity', 'workflow', 'review', 'detailing', 'collection', 'infusion', 'transit', 'scheduling']):
            return 'Process'
        if any(w in text for w in ['persona', 'stakeholder', 'representative', 'specialist', 'physician', 'professional', 'practitioner', 'nurse', 'clinician', 'doctor', 'payer', 'pbm', 'auditor', 'coordinator', 'patient', 'kol']):
            return 'Persona'
        if any(w in text for w in ['system', 'platform', 'crm', 'erp', 'tracker', 'database', 'channel', 'promomats']):
            return 'System'
        if any(w in text for w in ['metric', 'kpi', 'rate', 'score', 'decile', 'index', 'volume', 'cycletime', 'amount']):
            return 'Metric'
        if any(w in text for w in ['event', 'alert', 'milestone', 'record', 'disbursement', 'transfer']):
            return 'Event'
        return 'Entity'

    # 2. Extract OWL/RDFS Classes & SKOS Concepts
    classes = list(g.subjects(RDF.type, OWL.Class)) + list(g.subjects(RDF.type, RDFS.Class))
    for c in classes:
        uri_str = str(c)
        if isinstance(c, URIRef) and uri_str not in concepts_dict:
            label = g.value(c, RDFS.label)
            comment = g.value(c, RDFS.comment)
            slug = get_local_name(uri_str)
            
            parent_uris = []
            for p in g.objects(c, RDFS.subClassOf):
                if isinstance(p, URIRef) and str(p) != uri_str and str(p) != str(OWL.Thing):
                    parent_uris.append(str(p))
            
            primary_parent = parent_uris[0] if parent_uris else None
            lbl_str = str(label) if label else slug
            
            concepts_dict[uri_str] = {
                "uri": uri_str,
                "label": lbl_str,
                "description": str(comment) if comment else "",
                "concept_type": infer_concept_type(lbl_str, slug),
                "parent_uri": primary_parent,
                "parent_uris": parent_uris,
                "attributes": []
            }

    # Extract SKOS Concepts if present
    SKOS_CONCEPT = URIRef("http://www.w3.org/2004/02/skos/core#Concept")
    SKOS_PREF_LABEL = URIRef("http://www.w3.org/2004/02/skos/core#prefLabel")
    SKOS_BROADER = URIRef("http://www.w3.org/2004/02/skos/core#broader")

    for c in g.subjects(RDF.type, SKOS_CONCEPT):
        uri_str = str(c)
        if isinstance(c, URIRef) and uri_str not in concepts_dict:
            pref = g.value(c, SKOS_PREF_LABEL) or g.value(c, RDFS.label)
            comment = g.value(c, RDFS.comment)
            slug = get_local_name(uri_str)
            
            parent_uris = []
            for p in g.objects(c, SKOS_BROADER):
                if isinstance(p, URIRef) and str(p) != uri_str:
                    parent_uris.append(str(p))
            
            primary_parent = parent_uris[0] if parent_uris else None
            lbl_str = str(pref) if pref else slug
            
            concepts_dict[uri_str] = {
                "uri": uri_str,
                "label": lbl_str,
                "description": str(comment) if comment else "",
                "concept_type": infer_concept_type(lbl_str, slug),
                "parent_uri": primary_parent,
                "parent_uris": parent_uris,
                "attributes": []
            }

    # 3. Extract Datatype Properties (Attributes)
    for p in g.subjects(RDF.type, OWL.DatatypeProperty):
        uri_str = str(p)
        label = g.value(p, RDFS.label)
        comment = g.value(p, RDFS.comment)
        domain = g.value(p, RDFS.domain)
        range_ = g.value(p, RDFS.range)
        
        attr_name = str(label) if label else get_local_name(uri_str)
        datatype = get_local_name(str(range_)) if range_ else "string"
        desc = str(comment) if comment else ""
        
        if domain and str(domain) in concepts_dict:
            concepts_dict[str(domain)]["attributes"].append({
                "uri": uri_str,
                "name": attr_name,
                "datatype": datatype,
                "description": desc,
                "required": False
            })

    # 4. Extract Object Properties (Relationships)
    for p in g.subjects(RDF.type, OWL.ObjectProperty):
        uri_str = str(p)
        label = g.value(p, RDFS.label)
        comment = g.value(p, RDFS.comment)
        domain = g.value(p, RDFS.domain)
        range_ = g.value(p, RDFS.range)
        
        rel_name = str(label) if label else get_local_name(uri_str)
        desc = str(comment) if comment else ""
        
        if domain and range_:
            relationships.append({
                "uri": uri_str,
                "name": rel_name,
                "description": desc,
                "source_uri": str(domain),
                "target_uri": str(range_),
                "cardinality": "one-to-many",
                "property_type": "ObjectProperty"
            })

    # 5. Extract Taxonomic subClassOf / Broader Relationships into visible graph edges
    existing_pairs = {(r["source_uri"], r["target_uri"], r["name"]) for r in relationships}
    for c_uri, c_data in concepts_dict.items():
        for p_uri in c_data.get("parent_uris", []):
            if p_uri in concepts_dict and (c_uri, p_uri, "subClassOf") not in existing_pairs:
                parent_label = concepts_dict[p_uri]["label"]
                relationships.append({
                    "uri": f"{c_uri}#subClassOf#{p_uri}",
                    "name": "subClassOf",
                    "description": f"{c_data['label']} is a specialization/subclass of {parent_label}",
                    "source_uri": c_uri,
                    "target_uri": p_uri,
                    "cardinality": "many-to-one",
                    "property_type": "ObjectProperty"
                })
                existing_pairs.add((c_uri, p_uri, "subClassOf"))

    return {
        "name": get_local_name(ontology_uri),
        "namespace_uri": ontology_uri,
        "description": description,
        "concepts": list(concepts_dict.values()),
        "relationships": relationships
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    fmt = sys.argv[2] if len(sys.argv) > 2 else None
    
    if not os.path.exists(file_path):
        print(json.dumps({"error": f"File not found: {file_path}"}))
        sys.exit(1)
        
    try:
        res = parse_rdf(file_path, fmt)
        print(json.dumps(res))
    except Exception as e:
        import traceback
        print(json.dumps({"error": str(e), "traceback": traceback.format_exc()}))
        sys.exit(1)
