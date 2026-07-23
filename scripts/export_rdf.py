import sys
import json
import os
from pathlib import Path
from rdflib import Graph, RDF, OWL, RDFS, XSD, SH, URIRef, Literal, Namespace

def serialize_w3c_ontology(data, fmt='turtle'):
    g = Graph()

    # Determine namespace base URI
    ns_uri = data.get('namespaceUri') or data.get('namespace_uri') or f"http://enterprise.org/ontologies/{data.get('name', 'domain').lower().replace(' ', '_')}#"
    if not ns_uri.endswith('#') and not ns_uri.endswith('/'):
        ns_uri += '#'

    EX = Namespace(ns_uri)
    g.bind("ex", EX)
    g.bind("owl", OWL)
    g.bind("rdfs", RDFS)
    g.bind("rdf", RDF)
    g.bind("xsd", XSD)
    g.bind("sh", SH)

    # 1. Ontology Metadata Header
    onto_uri = URIRef(ns_uri.rstrip('#'))
    g.add((onto_uri, RDF.type, OWL.Ontology))
    if data.get('description'):
        g.add((onto_uri, RDFS.comment, Literal(data['description'])))
    if data.get('version'):
        g.add((onto_uri, OWL.versionInfo, Literal(data['version'])))

    # Map concepts to URIs for quick lookup
    concept_uri_map = {}
    concepts = data.get('concepts', [])

    # 2. Add Classes (Concepts) & rdfs:subClassOf
    for c in concepts:
        label = c.get('label', '').strip()
        if not label:
            continue
        
        c_uri = URIRef(c.get('uri') or f"{ns_uri}{label.replace(' ', '')}")
        concept_uri_map[c['id']] = c_uri
        concept_uri_map[label.lower()] = c_uri

        g.add((c_uri, RDF.type, OWL.Class))
        g.add((c_uri, RDFS.label, Literal(label)))
        if c.get('description'):
            g.add((c_uri, RDFS.comment, Literal(c['description'])))

        # SubClassOf hierarchy
        if c.get('parentConceptId') and c['parentConceptId'] in concept_uri_map:
            g.add((c_uri, RDFS.subClassOf, concept_uri_map[c['parentConceptId']]))

    # 3. Add Attributes (owl:DatatypeProperty)
    for c in concepts:
        c_uri = concept_uri_map.get(c['id'])
        if not c_uri:
            continue
        
        for attr in c.get('attributes', []):
            attr_name = attr.get('name', '').strip()
            if not attr_name:
                continue
            
            attr_uri = URIRef(attr.get('uri') or f"{ns_uri}has{attr_name[0].upper()}{attr_name[1:]}")
            g.add((attr_uri, RDF.type, OWL.DatatypeProperty))
            g.add((attr_uri, RDFS.label, Literal(attr_name)))
            g.add((attr_uri, RDFS.domain, c_uri))

            if attr.get('description'):
                g.add((attr_uri, RDFS.comment, Literal(attr['description'])))

            # Datatype Mapping
            dt_str = (attr.get('datatype') or 'string').lower()
            if dt_str in ('integer', 'int'):
                g.add((attr_uri, RDFS.range, XSD.integer))
            elif dt_str in ('float', 'double', 'decimal', 'number'):
                g.add((attr_uri, RDFS.range, XSD.float))
            elif dt_str in ('boolean', 'bool'):
                g.add((attr_uri, RDFS.range, XSD.boolean))
            elif dt_str in ('datetime', 'date', 'timestamp'):
                g.add((attr_uri, RDFS.range, XSD.dateTime))
            else:
                g.add((attr_uri, RDFS.range, XSD.string))

    # 4. Add Relationships (owl:ObjectProperty)
    for rel in data.get('relationships', []):
        rel_name = rel.get('name', '').strip()
        if not rel_name:
            continue

        src_val = rel.get('source')
        if isinstance(src_val, dict):
          src_val = src_val.get('label') or src_val.get('id') or ''
        
        tgt_val = rel.get('target')
        if isinstance(tgt_val, dict):
          tgt_val = tgt_val.get('label') or tgt_val.get('id') or ''

        src_uri = concept_uri_map.get(rel.get('sourceId')) or concept_uri_map.get(str(src_val).lower())
        tgt_uri = concept_uri_map.get(rel.get('targetId')) or concept_uri_map.get(str(tgt_val).lower())

        if src_uri and tgt_uri:
            rel_uri = URIRef(rel.get('uri') or f"{ns_uri}{rel_name}")
            g.add((rel_uri, RDF.type, OWL.ObjectProperty))
            g.add((rel_uri, RDFS.label, Literal(rel_name)))
            g.add((rel_uri, RDFS.domain, src_uri))
            g.add((rel_uri, RDFS.range, tgt_uri))
            if rel.get('description'):
                g.add((rel_uri, RDFS.comment, Literal(rel['description'])))

    # 5. Add SHACL Shapes for Constraints
    for constr in data.get('constraints', []):
        constr_name = constr.get('name', 'Shape').replace(' ', '')
        shape_uri = URIRef(f"{ns_uri}{constr_name}Shape")
        g.add((shape_uri, RDF.type, SH.NodeShape))

        if constr.get('description'):
            g.add((shape_uri, RDFS.comment, Literal(constr['description'])))

    # Format normalizer for rdflib
    fmt_norm = fmt.lower()
    if fmt_norm in ('ttl', 'turtle'):
        rdflib_fmt = 'turtle'
    elif fmt_norm in ('xml', 'owl', 'rdf'):
        rdflib_fmt = 'xml'
    elif fmt_norm in ('jsonld', 'json-ld', 'json'):
        rdflib_fmt = 'json-ld'
    elif fmt_norm == 'nt':
        rdflib_fmt = 'nt'
    else:
        rdflib_fmt = 'turtle'

    return g.serialize(format=rdflib_fmt)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No JSON payload file provided"}))
        sys.exit(1)

    json_path = sys.argv[1]
    fmt = sys.argv[2] if len(sys.argv) > 2 else 'turtle'

    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        output = serialize_w3c_ontology(data, fmt)
        print(output)
    except Exception as e:
        import traceback
        print(json.dumps({"error": str(e), "traceback": traceback.format_exc()}))
        sys.exit(1)
