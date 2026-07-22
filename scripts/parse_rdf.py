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

    # 2. Extract OWL/RDFS Classes (Concepts)
    for c in g.subjects(RDF.type, OWL.Class):
        uri_str = str(c)
        if isinstance(c, URIRef): # Ignore blank nodes
            label = g.value(c, RDFS.label)
            comment = g.value(c, RDFS.comment)
            slug = get_local_name(uri_str)
            concepts_dict[uri_str] = {
                "uri": uri_str,
                "label": str(label) if label else slug,
                "description": str(comment) if comment else "",
                "concept_type": "Entity", # Default type
                "attributes": []
            }

    # Fallback to RDFS.Class if OWL.Class is empty
    if not concepts_dict:
        for c in g.subjects(RDF.type, RDFS.Class):
            uri_str = str(c)
            if isinstance(c, URIRef):
                label = g.value(c, RDFS.label)
                comment = g.value(c, RDFS.comment)
                slug = get_local_name(uri_str)
                concepts_dict[uri_str] = {
                    "uri": uri_str,
                    "label": str(label) if label else slug,
                    "description": str(comment) if comment else "",
                    "concept_type": "Entity",
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
        
        # If domain is specified, attach to that concept
        if domain and str(domain) in concepts_dict:
            concepts_dict[str(domain)]["attributes"].append({
                "name": attr_name,
                "datatype": datatype,
                "description": desc,
                "required": False
            })
        else:
            # If no domain, attach to all or log as orphan
            pass

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
                "name": rel_name,
                "description": desc,
                "source_uri": str(domain),
                "target_uri": str(range_),
                "cardinality": "one-to-many"
            })

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
